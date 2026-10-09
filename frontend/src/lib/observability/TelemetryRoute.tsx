import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPage } from './index';


// Tracks the current page without displaying anything on screen.
export function TelemetryRoute() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Tell Faro which page the user opened.
    trackPage(pathname);
  }, [pathname]);

  return null;
}