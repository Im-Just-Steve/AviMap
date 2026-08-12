# AviMap data sources

## NATS AIS — UK ICAO AIP Dataset

https://nats-uk.ead-it.com/

AviMap uses the NATS UK ICAO AIP Dataset as its authoritative source for UK
permanent and long-duration aeronautical information, including the airspace
geometry used by the map. The dataset is published on AIRAC effective dates
and supplied in AIXM 5.1 XML with KML as a secondary format.

## NATS AIS — Visual Reference Points List

https://nats-uk.ead-it.com/

AviMap uses the NATS Visual Reference Points List for UK VRPs. This is an
irregular NATS dataset and is selected by effective date by the GitHub Actions
pipeline.

## OurAirports

https://ourairports.com/data/

The initial airport/aerodrome catalogue uses the OurAirports public-domain
dataset. This is separate from the authoritative UK aviation overlays.

## CAA

https://www.caa.co.uk/

CAA material may be used for supporting documentation and regulatory context.

AviMap is not a substitute for the current UK AIP, NOTAMs, or official flight
information. Always verify current operational information before real-world
flight.
