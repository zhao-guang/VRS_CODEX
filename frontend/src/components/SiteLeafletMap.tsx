import * as L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

import type { Site } from '../types';

type SitePosition = {
  id: number;
  label: string;
  status: string | null;
  lat: number;
  lon: number;
};

type SiteLeafletMapProps = {
  sites: Site[];
  onSiteSelect?: (siteId: number) => void;
};

function normalizeSitePosition(site: Site): SitePosition | null {
  const rawLat = site.latitude;
  const rawLon = site.longitude;

  if (rawLat === null || rawLon === null) {
    return null;
  }

  let lat = rawLat;
  let lon = rawLon;

  if (Math.abs(lat) > 90 && Math.abs(lon) <= 90 && Math.abs(lat) <= 180) {
    lat = rawLon;
    lon = rawLat;
  }

  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }

  return {
    id: site.id,
    lat,
    lon,
    label: site.four_char_id ?? site.name ?? `SITE-${site.id}`,
    status: site.site_status,
  };
}

function markerClass(status: string | null) {
  if (status === 'PRIVATE') {
    return 'running';
  }

  if (status?.toLowerCase() === 'deleted' || status?.toLowerCase() === 'failed') {
    return 'failed';
  }

  return 'online';
}

function clusterCellSize(zoom: number) {
  if (zoom >= 8) {
    return 0;
  }

  if (zoom >= 6) {
    return 54;
  }

  if (zoom >= 4) {
    return 72;
  }

  return 94;
}

function getRenderablePositions(map: L.Map, positions: SitePosition[]) {
  const bounds = map.getBounds().pad(0.35);
  return positions.filter((site) => bounds.contains([site.lat, site.lon]));
}

function addSiteMarker(markerLayer: L.LayerGroup, site: SitePosition, onSiteSelect?: (siteId: number) => void) {
  const statusClass = markerClass(site.status);
  const icon = L.divIcon({
    className: `site-leaflet-marker ${statusClass}`,
    html: '<span></span>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

  const marker = L.marker([site.lat, site.lon], { icon })
    .bindTooltip(site.label, {
      direction: 'top',
      offset: [0, -8],
      className: 'site-map-tooltip',
    })
    .addTo(markerLayer);

  if (onSiteSelect) {
    marker.on('click', () => onSiteSelect(site.id));
  }
}

function addClusterMarker(markerLayer: L.LayerGroup, map: L.Map, clusterSites: SitePosition[]) {
  const count = clusterSites.length;
  const lat = clusterSites.reduce((sum, site) => sum + site.lat, 0) / count;
  const lon = clusterSites.reduce((sum, site) => sum + site.lon, 0) / count;
  const size = count >= 100 ? 38 : count >= 20 ? 34 : 29;
  const scaleClass = count >= 100 ? 'large' : count >= 20 ? 'medium' : 'small';
  const icon = L.divIcon({
    className: `site-cluster-marker ${scaleClass}`,
    html: `<span>${count.toLocaleString()}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

  L.marker([lat, lon], { icon })
    .bindTooltip(`${count.toLocaleString()} 个站点`, {
      direction: 'top',
      offset: [0, -12],
      className: 'site-map-tooltip',
    })
    .on('click', () => {
      const bounds = L.latLngBounds(clusterSites.map((site) => [site.lat, site.lon]));
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: Math.min(map.getZoom() + 2, 8) });
    })
    .addTo(markerLayer);
}

export function SiteLeafletMap({ sites, onSiteSelect }: SiteLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);

  const positions = useMemo(() => sites.map(normalizeSitePosition).filter((item): item is SitePosition => item !== null), [sites]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      attributionControl: false,
      zoomControl: true,
      worldCopyJump: true,
    }).setView([-25, 135], 3);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12,
      minZoom: 2,
      className: 'overview-osm-tile',
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    L.control.attribution({ prefix: false }).addTo(map);

    const markerLayer = L.layerGroup().addTo(map);
    markerLayerRef.current = markerLayer;
    mapRef.current = map;

    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;

    if (!map || !markerLayer) {
      return;
    }

    const renderMarkers = () => {
      markerLayer.clearLayers();

      if (positions.length === 0) {
        return;
      }

      const renderablePositions = getRenderablePositions(map, positions);

      if (renderablePositions.length === 0) {
        return;
      }

      const cellSize = clusterCellSize(map.getZoom());

      if (cellSize === 0) {
        renderablePositions.forEach((site) => addSiteMarker(markerLayer, site, onSiteSelect));
        return;
      }

      const clusters = new Map<string, SitePosition[]>();

      renderablePositions.forEach((site) => {
        const point = map.project([site.lat, site.lon], map.getZoom());
        const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
        const clusterSites = clusters.get(key);

        if (clusterSites) {
          clusterSites.push(site);
        } else {
          clusters.set(key, [site]);
        }
      });

      clusters.forEach((clusterSites) => {
        if (clusterSites.length === 1) {
          addSiteMarker(markerLayer, clusterSites[0], onSiteSelect);
        } else {
          addClusterMarker(markerLayer, map, clusterSites);
        }
      });
    };

    if (positions.length === 1) {
      map.setView([positions[0].lat, positions[0].lon], 6);
    } else if (positions.length > 1) {
      const bounds = L.latLngBounds(positions.map((site) => [site.lat, site.lon]));
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 5 });
    } else {
      map.setView([-25, 135], 3);
    }

    renderMarkers();
    map.on('zoomend moveend', renderMarkers);

    return () => {
      map.off('zoomend moveend', renderMarkers);
    };
  }, [onSiteSelect, positions]);

  return <div ref={containerRef} className="map-leaflet" aria-label="OpenStreetMap 站点分布图" />;
}
