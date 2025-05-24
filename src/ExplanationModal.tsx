import React from 'react';

import './ExplanationModal.css';

const ExplanationModal = () => {
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>🌍 Welcome to Nature Explorer! 🌿</h2>
        <p>
          Get ready to uncover the hidden wonders of nature right around you! 🗺️ <br />
          From lush trails to vibrant wildlife, Nature Explorer is your gateway to adventure.
        </p>
        <p>
          To make the magic happen, we need your location. 🌟 <br />
          Enable geolocation services and let the exploration begin!
        </p>
        <p>
          Your next great discovery is just a click away. Let’s go! 🚀
        </p>
      </div>
    </div>
  );
};

export default ExplanationModal;
