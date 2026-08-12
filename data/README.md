# AviMap aviation data

`uk-airspace.geojson` is populated by the GitHub Actions workflow
`.github/workflows/update-aviation-data.yml`.

The workflow downloads the OpenAIP UK airspace export server-side and commits
it into this repository. The PWA then reads the file from its own GitHub Pages
origin, avoiding the CORS restriction on the OpenAIP Google Cloud Storage
bucket.

Do not treat this development dataset as authoritative operational UK AIP/AIS
data.


`uk-reporting-points.geojson` is populated by the same GitHub Actions workflow
from the OpenAIP UK `rpp` export. The PWA reads the committed local file so
GitHub Pages does not need to call the OpenAIP storage bucket directly.
