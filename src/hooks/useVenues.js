import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiFetchVenues, getLocalCachedVenues } from '../services/db';
import { calculateDistance } from '../utils/geo';

/**
 * Custom hook to fetch and filter sports venues
 */
export function useVenues({ initialSport = 'All', userCoords = null, ownerId = null } = {}) {
  const [venues, setVenues] = useState(() => {
    try {
      const cached = getLocalCachedVenues(ownerId ? { ownerId } : {});
      return Array.isArray(cached) ? cached : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      const cached = getLocalCachedVenues(ownerId ? { ownerId } : {});
      return !cached || cached.length === 0;
    } catch {
      return true;
    }
  });
  const [error, setError] = useState(null);
  const [selectedSport, setSelectedSport] = useState(initialSport);
  const [searchQuery, setSearchQuery] = useState('');

  const loadVenues = useCallback(async () => {
    try {
      const params = ownerId ? { ownerId } : {};
      const cached = getLocalCachedVenues(params);
      if (cached && cached.length > 0) {
        setVenues(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);
      const data = await apiFetchVenues(params);
      setVenues(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error in useVenues:', err);
      setError('Unable to load venues. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    loadVenues();
  }, [loadVenues]);

  // Compute filtered & distance-annotated venues
  const filteredVenues = useMemo(() => {
    return venues
      .map((venue) => {
        let distance = null;
        if (userCoords?.latitude && userCoords?.longitude && venue.lat && venue.lng) {
          distance = calculateDistance(
            userCoords.latitude,
            userCoords.longitude,
            venue.lat,
            venue.lng
          );
        }
        return { ...venue, calculatedDistance: distance };
      })
      .filter((venue) => {
        // Sport filter
        const matchesSport =
          selectedSport === 'All' ||
          venue.sport?.toLowerCase() === selectedSport.toLowerCase() ||
          (Array.isArray(venue.sports) &&
            venue.sports.some((s) => s.toLowerCase() === selectedSport.toLowerCase()));

        // Search query filter
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery =
          !q ||
          venue.name?.toLowerCase().includes(q) ||
          venue.address?.toLowerCase().includes(q) ||
          venue.city?.toLowerCase().includes(q) ||
          venue.sport?.toLowerCase().includes(q);

        return matchesSport && matchesQuery;
      });
  }, [venues, selectedSport, searchQuery, userCoords]);

  return {
    venues,
    filteredVenues,
    loading,
    error,
    selectedSport,
    setSelectedSport,
    searchQuery,
    setSearchQuery,
    refetchVenues: loadVenues
  };
}

