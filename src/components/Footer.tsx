import React from 'react';
import GitHubButton from 'react-github-btn';
const Footer = () => {
  return (
    <footer className="bg-white/80 backdrop-blur-md py-4 border-t border-gray-200">
      <div className="container mx-auto px-4 flex flex-col items-center text-center text-sm text-gray-500">
        <p>All processing happens locally in your browser. Your images are never uploaded to any server.</p> 
      </div>
    </footer>
  );
};

export default Footer;
