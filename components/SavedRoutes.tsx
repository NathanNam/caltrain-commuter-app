'use client';

import { useState, useEffect } from 'react';
import { SavedRoute } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { ErrorBoundary, useErrorHandler, SimpleErrorFallback } from './ErrorBoundary';

interface SavedRoutesProps {
  currentOriginId: string;
  currentDestinationId: string;
  onRouteSelect: (originId: string, destinationId: string) => void;
}

const STORAGE_KEY = 'caltrain_saved_routes';
const MAX_ROUTES = 5;

function SavedRoutesContent({
  currentOriginId,
  currentDestinationId,
  onRouteSelect
}: SavedRoutesProps) {
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const handleError = useErrorHandler();

  // Load saved routes from localStorage with error handling
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsedRoutes = JSON.parse(saved);

        // Validate the parsed data structure
        if (!Array.isArray(parsedRoutes)) {
          throw new Error('Saved routes data is not an array');
        }

        // Validate each route object
        const validRoutes = parsedRoutes.filter((route: any) => {
          return (
            route &&
            typeof route === 'object' &&
            typeof route.id === 'string' &&
            typeof route.name === 'string' &&
            typeof route.originId === 'string' &&
            typeof route.destinationId === 'string'
          );
        });

        // If some routes were invalid, save the cleaned data
        if (validRoutes.length !== parsedRoutes.length) {
          console.warn(`Removed ${parsedRoutes.length - validRoutes.length} invalid saved routes`);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(validRoutes));
        }

        setRoutes(validRoutes);
      }
    } catch (e) {
      console.error('Failed to parse saved routes:', e);
      setStorageError('Saved routes data was corrupted and has been cleared.');

      // Clear corrupted data
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (clearError) {
        console.error('Failed to clear corrupted localStorage:', clearError);
      }

      // Report error for monitoring
      if (e instanceof Error) {
        handleError(new Error(`SavedRoutes localStorage corruption: ${e.message}`));
      }
    }
  }, [handleError]);

  // Save routes to localStorage with error handling
  const saveRoutes = (newRoutes: SavedRoute[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newRoutes));
      setRoutes(newRoutes);
      setStorageError(null); // Clear any previous storage errors
    } catch (e) {
      console.error('Failed to save routes to localStorage:', e);
      setStorageError('Failed to save routes. Your browser storage may be full.');

      // Report error for monitoring
      if (e instanceof Error) {
        handleError(new Error(`SavedRoutes localStorage save error: ${e.message}`));
      }
    }
  };

  const handleSaveRoute = () => {
    if (!routeName.trim() || !currentOriginId || !currentDestinationId) {
      return;
    }

    if (routes.length >= MAX_ROUTES && !editingId) {
      alert(`Maximum of ${MAX_ROUTES} routes can be saved`);
      return;
    }

    if (editingId) {
      // Update existing route
      const updated = routes.map(route =>
        route.id === editingId
          ? { ...route, name: routeName.trim() }
          : route
      );
      saveRoutes(updated);
      setEditingId(null);
    } else {
      // Add new route
      const newRoute: SavedRoute = {
        id: Date.now().toString(),
        name: routeName.trim(),
        originId: currentOriginId,
        destinationId: currentDestinationId
      };
      saveRoutes([...routes, newRoute]);
    }

    setRouteName('');
    setShowSaveForm(false);
  };

  const handleDeleteRoute = (id: string) => {
    if (confirm('Delete this saved route?')) {
      saveRoutes(routes.filter(route => route.id !== id));
    }
  };

  const handleEditRoute = (route: SavedRoute) => {
    setRouteName(route.name);
    setEditingId(route.id);
    setShowSaveForm(true);
  };

  const canSaveCurrentRoute = currentOriginId && currentDestinationId && currentOriginId !== currentDestinationId;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {/* Storage Error Display */}
      {storageError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-red-400 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-red-800 text-sm">{storageError}</span>
          </div>
          <button
            onClick={() => setStorageError(null)}
            className="mt-2 text-red-600 hover:text-red-800 text-sm underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Saved Routes</h2>
        {canSaveCurrentRoute && !showSaveForm && routes.length < MAX_ROUTES && (
          <button
            onClick={() => setShowSaveForm(true)}
            className="text-sm bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded transition-colors"
          >
            + Save Current
          </button>
        )}
      </div>

      {/* Save Form */}
      {showSaveForm && canSaveCurrentRoute && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <label htmlFor="route-name" className="block text-sm font-medium text-gray-700 mb-2">
            Route Name
          </label>
          <input
            id="route-name"
            type="text"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="e.g., Home to Work"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2 text-gray-900"
            maxLength={30}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveRoute}
              disabled={!routeName.trim()}
              className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white px-3 py-2 rounded transition-colors text-sm font-medium"
            >
              {editingId ? 'Update' : 'Save'}
            </button>
            <button
              onClick={() => {
                setShowSaveForm(false);
                setRouteName('');
                setEditingId(null);
              }}
              className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-2 rounded transition-colors text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Saved Routes List */}
      {routes.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">
          No saved routes yet. Select a route and save it for quick access!
        </p>
      ) : (
        <div className="space-y-2">
          {routes.map((route) => {
            const origin = getStationById(route.originId);
            const destination = getStationById(route.destinationId);

            if (!origin || !destination) return null;

            return (
              <div
                key={route.id}
                className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors"
              >
                <div className="flex justify-between items-start gap-2">
                  <button
                    onClick={() => onRouteSelect(route.originId, route.destinationId)}
                    className="flex-1 text-left"
                  >
                    <div className="font-semibold text-gray-800 mb-1">
                      {route.name}
                    </div>
                    <div className="text-sm text-gray-600">
                      {origin.name} → {destination.name}
                    </div>
                  </button>

                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEditRoute(route)}
                      className="p-1 text-gray-600 hover:text-blue-600 transition-colors"
                      aria-label="Edit route"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteRoute(route.id)}
                      className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                      aria-label="Delete route"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {routes.length >= MAX_ROUTES && (
        <p className="text-xs text-gray-500 mt-2 text-center">
          Maximum of {MAX_ROUTES} routes reached
        </p>
      )}
    </div>
  );
}

// Export the component wrapped with ErrorBoundary
export default function SavedRoutes(props: SavedRoutesProps) {
  return (
    <ErrorBoundary
      fallback={
        <SimpleErrorFallback
          message="Unable to load saved routes"
          resetError={() => window.location.reload()}
        />
      }
    >
      <SavedRoutesContent {...props} />
    </ErrorBoundary>
  );
}
