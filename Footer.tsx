import React from 'react';
import { ZALO_LINK } from './constants';
import PhoneIcon from './components/icons/PhoneIcon';
import SmileyIcon from './components/icons/SmileyIcon';

const Footer: React.FC = () => {
  return (
    <footer className="w-full mt-12 py-6">
      <div className="max-w-2xl mx-auto flex justify-center items-center">
        <a
          href={ZALO_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-2 text-lg text-dark-olive/80 dark:text-cream/80 hover:text-olive dark:hover:text-light-olive transition-colors duration-300 font-semibold"
          aria-label="Liên hệ ngay để được hướng dẫn"
        >
          <PhoneIcon className="w-6 h-6" />
          <span>LIÊN HỆ NGAY để hướng dẫn</span>
          <SmileyIcon className="w-6 h-6 text-olive dark:text-light-olive" fill="currentColor" />
        </a>
      </div>
    </footer>
  );
};

export default Footer;