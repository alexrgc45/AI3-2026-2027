// Distancia em metros entre dois pontos { lat, lng } usando a formula de Haversine
function distanciaEmMetros(a, b) {
  const R = 6371000;
  const paraRad = (graus) => (graus * Math.PI) / 180;
  const dLat = paraRad(b.lat - a.lat);
  const dLng = paraRad(b.lng - a.lng);
  const lat1 = paraRad(a.lat);
  const lat2 = paraRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

module.exports = { distanciaEmMetros };