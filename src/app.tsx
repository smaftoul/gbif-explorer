'use client'

import * as React from 'react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Map,
  Marker,
  Popup,
  NavigationControl,
  GeolocateControl,
  MapRef,
  ViewState,
} from 'react-map-gl/maplibre';
import { polygonToCellsExperimental, POLYGON_TO_CELLS_FLAGS, cellsToMultiPolygon } from 'h3-js';
import '@khmyznikov/pwa-install';
import 'maplibre-gl/dist/maplibre-gl.css';

const GBIF_API_BASE_URL = 'https://api.gbif.org/v1';

export interface Occurrence {
  key: number;
  scientificName: string;
  taxonKey: number;
  decimalLatitude: number;
  decimalLongitude: number;
  eventDate: string;
  basisOfRecord: string;
  kingdom: string;
}

// Function to get color based on kingdom
function getColor(kingdom: string) {
  switch (kingdom) {
    case 'Plantae':
      return '#228B22'; // Forest Green for plants
    case 'Animalia':
      return '#4682B4'; // Steel Blue for animals
    case 'Fungi':
      return '#D2691E'; // Chocolate for fungi
    default:
      return '#A9A9A9'; // Dark Gray for others
  }
}

export async function getWikidataImages(taxonId: number) {
  const url = `https://query.wikidata.org/sparql?query=`
    + `SELECT ?item ?itemLabel ?image WHERE { `
    + `  ?item wdt:P846 "${taxonId}" . `
    + `  OPTIONAL { ?item wdt:P18 ?image } `
    + `  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". } `
    + `}`;
  const headers = {
    'Accept': 'application/json',
  };
  const response = await fetch(url, { headers });
  if (!response.ok) {
    console.error(`Wikidata API error: ${response.status} ${response.statusText}`);
    return null;
  }
  const data = await response.json();
  const items = data.results.bindings;
  if (items.length === 0) {
    console.log(`No images found for taxon ID ${taxonId}`);
    return null;
  }
  const images = items.map((item: any) => {
    return {
      label: item.itemLabel.value,
      image: item.image ? item.image.value : null,
    };
  });
  return images;
}


export async function getLocalizedNameFromGBIF(taxtonId: number) {
  const localStorageKey = `localizedName-${taxtonId}`;

  const storedName = localStorage.getItem(localStorageKey);
  if (storedName !== null) {
    return storedName;
  }

  const url = `${GBIF_API_BASE_URL}/species/${taxtonId}`;
  console.log(`Querying GBIF API for vernacular names of taxon ${taxtonId} in locale ${navigator.language}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`GBIF API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const vernacularName = data.vernacularName || null;
    localStorage.setItem(localStorageKey, vernacularName);
    return vernacularName;
  } catch (error) {
    console.error(`Error fetching data from GBIF API for taxon ${taxtonId}:`, error);
    return null;
  }
}


const fetchOccurrences = async (
  geometry: string,
  dateRange: string = '',
  coordinateUncertaintyInMeters: number = 500
): Promise<Occurrence[]> => {
  let offset = 0;
  const limit = 300;
  let allOccurrences: Occurrence[] = [];
  let hasMoreData = true;

  while (hasMoreData) {
    const url = `${GBIF_API_BASE_URL}/occurrence/search?geometry=${geometry}&fields=key,scientificName,decimalLatitude,decimalLongitude,eventDate,basisOfRecord,kingdom&lastInterpretedDate=${dateRange}&limit=${limit}&coordinateUncertaintyInMeters=0,${coordinateUncertaintyInMeters}&offset=${offset}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`GBIF API request failed with status: ${response.status}`);
    }

    const data = await response.json();

    allOccurrences = allOccurrences.concat(data.results as Occurrence[]);
    if (data.count < offset) {
      offset += limit;
    } else {
      hasMoreData = false;
    }
  }
  return allOccurrences;
};

export default function App() {
  const mapRef = useRef<MapRef | undefined>(undefined);
  const [userPos, setUserPos] = useState({ lat: null, long: null })
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);
  const [mapMoved, setMapMoved] = useState<ViewState | undefined>(undefined);
  const [bounds, setBounds] = useState<any>([]);
  const [cells, setCells] = useState<any>([]);
  const [popupInfo, setPopupInfo] = useState(null);
  const [observations, setObservations] = useState([])
  const [localizedName, setLocalizedName] = useState<string | null>(null);
  const [speciesImage, setSpeciesImage] = useState([])
  const [isLoadingImages, setIsLoadingImages] = useState<boolean>(false);



  useEffect(() => {
    navigator.geolocation.getCurrentPosition((pos) => {
      const newUserPos = {
        lat: pos.coords.latitude,
        long: pos.coords.longitude,
      };
      setUserPos(newUserPos)
      console.debug("acquired location:", newUserPos)
    }, (err) => {
      console.log(err);
    },
      // android requires this to work
      {
        enableHighAccuracy: false,
        timeout: 5000
      }
    );
  }, [])

  useEffect(() => {
    if (mapLoaded) {
      setBounds(mapRef.current.getMap().getBounds().toArray().flat());
    };
  }, [mapLoaded, mapMoved]);

  useEffect(() => {
    if (bounds.length === 0) {
      return;
    }
    console.log("Map bounds changed", bounds);

    const north = bounds[1];
    const south = bounds[3];
    const east = bounds[2];
    const west = bounds[0];

    const nw = [north, west];
    const ne = [north, east];
    const sw = [south, west];
    const se = [south, east];
    const polygon = [
      sw, nw, ne, se
    ];
    const res = 8;
    const cells = polygonToCellsExperimental(polygon, res, POLYGON_TO_CELLS_FLAGS.containmentOverlapping);
    console.log("cells", cells);
    setCells(cells);
  }, [bounds]);

  useEffect(() => {
    if (cells.length > 10) {
      console.log("more than 10 cells", cells);
      setObservations(cells);
      return;
    }
    const promises = cells.map(async (cell: string) => {
      const storedCell = localStorage.getItem(cell);
      const cellItem = JSON.parse(localStorage.getItem(storedCell) || '{"lastUpdated": "1970-01-01", "occurrences": []}');

      const oneDayInMilliseconds = 24 * 60 * 60 * 1000;
      const yesterday = new Date(Date.now() - oneDayInMilliseconds);
      const formatedDateEnd = `${yesterday.getFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}`;
      const dateRange = `${cellItem.lastUpdated},${formatedDateEnd}`;

      const polygon = cellsToMultiPolygon([cell], true);
      const coords = polygon[0][0];
      const wkt = `POLYGON((${coords.map((coord) => coord.join(' ')).join(', ')}))`

      if (cellItem.lastUpdated === formatedDateEnd) {
        console.log("cell", cell, "already up to date");
        return;
      }

      const occurrences = await fetchOccurrences(wkt, dateRange);

      const simpleoccurrences = occurrences.map((occurrence) => {
        return {
          key: occurrence.key,
          scientificName: occurrence.scientificName,
          decimalLatitude: occurrence.decimalLatitude,
          decimalLongitude: occurrence.decimalLongitude,
          eventDate: occurrence.eventDate,
          basisOfRecord: occurrence.basisOfRecord,
          kingdom: occurrence.kingdom,
          taxonKey: occurrence.taxonKey,
        }
      });

      const cellOccurrencesSet = new Set(cellItem.occurrences);
      simpleoccurrences.forEach((occurrence) => {
        cellOccurrencesSet.add(occurrence);
      });

      localStorage.setItem(cell, JSON.stringify({ lastUpdated: formatedDateEnd, occurences: Array.from(cellOccurrencesSet) }));
      console.log("cell", cell, "occurrences count", occurrences.length, "wkt", wkt);
    });
    Promise.all(promises);
    setObservations(cells);
  }, [cells]);

  const obs = useMemo(() => {
    const allOccurrences = [];
    cells.forEach((cellname: string) => {
      console.log("cellname", cellname);
      const cellData = localStorage.getItem(cellname);
      if (!cellData) {
        console.warn("No data found for cell ", cellname);
        return null;
      }

      const cell = JSON.parse(cellData);
      if (!cell.occurences || !Array.isArray(cell.occurences)) {
        console.warn("Invalid data structure for cell", cell);
        return null;
      }

      // append ther markers to the allOccurrences array
      // this will be used to render the markers
      allOccurrences.push(...cell.occurences);

    })
    console.log("allOccurrences", allOccurrences.length);
    return allOccurrences.map((occurrence) => (
      < Marker
        key={`marker-${occurrence.key}`}
        longitude={occurrence.decimalLongitude}
        latitude={occurrence.decimalLatitude}
        color={getColor(occurrence.kingdom)
        }
        anchor="bottom"
        onClick={e => {
          // If we let the click event propagates to the map, it will immediately close the popup
          // with `closeOnClick: true`
          e.originalEvent.stopPropagation();
          setPopupInfo({ latitude: occurrence.decimalLatitude, longitude: occurrence.decimalLongitude, ...occurrence });
        }}
      />
    ));
  }, [observations]);

  useEffect(() => {
    if (popupInfo && popupInfo.taxonKey) {
      // Set loading state to true when fetching new images
      setIsLoadingImages(true);
      setLocalizedName(null); // Clear previous localized name
      setSpeciesImage([]); // Clear previous images

      getLocalizedNameFromGBIF(popupInfo.taxonKey).then(name => {
        setLocalizedName(name);
      }).catch(error => {
        console.error("Error fetching localized name:", error);
        setLocalizedName(null);
      });

      getWikidataImages(popupInfo.taxonKey).then(images => {
        // rewrite urls to use https
        images = images.map((image) => {
          if (image.image && image.image.startsWith("http://")) {
            image.image = image.image.replace("http://", "https://");
          }
          return image;
        });
        setSpeciesImage(images);
        setIsLoadingImages(false); // Set loading state to false when images are loaded
      }).catch(error => {
        console.error("Error fetching species images:", error);
        setSpeciesImage([]);
        setIsLoadingImages(false); // Set loading state to false on error
      });
    }
  }, [popupInfo]);

  if (userPos.lat === null || userPos.long === null) {
    return <div>Waiting for user location...</div>;
  }

  const mapStyle = {
    "version": 8,
    "sources": {
      "gbif-natural": {
        "type": "raster",
        "tiles": [
          "https://tile.gbif.org/3857/omt/{z}/{x}/{y}@1x.png"
        ],
        "tileSize": 256,
        "attribution": "© <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap contributors</a>, <a href=\"https://www.gbif.org\">GBIF</a>"
      }
    },
    "layers": [
      {
        "id": "gbif-natural-layer",
        "type": "raster",
        "source": "gbif-natural",
        "paint": {
          "raster-opacity": 1
        }
      }
    ]
  };

  return (
    <>
      <pwa-install icon={`${import.meta.env.BASE_URL}favicon.svg`}></pwa-install>
      <Map
        initialViewState={{
          latitude: userPos.lat,
          longitude: userPos.long,
          zoom: 17,
          minZoom: 12,
          bearing: 0,
          pitch: 0
        }}
        mapStyle={mapStyle}
        onLoad={() => {
          setMapLoaded(true);
        }}
        onMoveEnd={(e) => {
          setMapMoved(e.viewState);
        }}
        ref={mapRef}
      >
        <GeolocateControl position="top-left" fitBoundsOptions={{ maxZoom: 17 }} trackUserLocation={true} />
        <NavigationControl position="top-left" />

        {obs}

        {popupInfo && (
          <Popup
            anchor="top"
            longitude={Number(popupInfo.longitude)}
            latitude={Number(popupInfo.latitude)}
            onClose={() => setPopupInfo(null)}
          >
            <div>
              <h3>{localizedName}</h3>
              <p><strong>Scientific Name:</strong> {popupInfo.scientificName}</p>
              <p><strong>Year:</strong> {new Date(popupInfo.eventDate).getFullYear()}</p>
              {isLoadingImages ? (
                <p>Loading images...</p>
              ) : (
                speciesImage != null && speciesImage.length > 0 && (
                  <div>
                    {speciesImage.map((image, index: number) => (
                      <img key={index} src={image.image} alt={image.label} style={{ width: '100%', height: 'auto' }} />
                    ))}
                  </div>
                )
              )}
            </div>
          </Popup>
        )}
      </Map>
    </>
  );
}

export function renderToDom(container) {
  createRoot(container).render(<App />);
}
