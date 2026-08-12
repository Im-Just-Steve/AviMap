# Aviation data

AviMap v1 uses:

- OurAirports for the UK airport/aerodrome catalogue. OurAirports states that
  its data is public domain and updated daily.
- OpenAIP for the UK airspace and reporting-point overlays.

The browser loads the data directly so the first iteration can use current
datasets without embedding a stale copy into the application.

For a production aviation product, we should add a controlled data pipeline
that ingests official UK AIS/AIP data and records the AIRAC effective date.
The CAA identifies the UK AIP/NATS AIS as an authoritative source of
aeronautical information; see the README for links.

Never treat the current community-data overlay as a substitute for current
AIP, NOTAMs or other operational sources.
