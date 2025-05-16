import * as React from 'react';

// function that return an html list from an array
function createList(array) {
  return (
    <ul>
      {array.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function ControlPanel(props) {
  return (
    <div className="control-panel">
      <div>{createList(props.bounds)}</div>
    </div>
  );
}

export default React.memo(ControlPanel);
