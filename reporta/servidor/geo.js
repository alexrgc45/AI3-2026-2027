const RAIO_TERRA_METROS = 6371000;

function paraRadianos(graus) {
  return (graus * Math.PI) / 180;
}

function distanciaEmMetros(a, b) {
  const dLat = paraRadianos(b.lat - a.lat);
  const dLng = paraRadianos(b.lng - a.lng);
  const lat1 = paraRadianos(a.lat);
  const lat2 = paraRadianos(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return RAIO_TERRA_METROS * c;
}

module.exports = { distanciaEmMetros };