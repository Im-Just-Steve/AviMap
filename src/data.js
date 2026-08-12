export const DATA_URLS = {
  airports: "https://davidmegginson.github.io/ourairports-data/airports.csv",

  // OpenAIP daily exports. ND-GeoJSON is included because current exports
  // can be newline-delimited rather than one FeatureCollection.
  airspace: "https://storage.googleapis.com/29f98e10-a489-4c82-ae5e-489dbcd4912f/gb_asp.geojson",
  airspaceNd: "https://storage.googleapis.com/29f98e10-a489-4c82-ae5e-489dbcd4912f/gb_asp.ndgeojson",
  airspaceJson: "https://storage.googleapis.com/29f98e10-a489-4c82-ae5e-489dbcd4912f/gb_asp.json",
  airspaceXml: "https://storage.googleapis.com/29f98e10-a489-4c82-ae5e-489dbcd4912f/gb_asp.xml"
};

export const DEFAULT_CENTER = [-2.4, 54.5];
export const DEFAULT_ZOOM = 5.7;
