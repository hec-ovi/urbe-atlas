# Changelog

0.1.3: default district count scales with city area (about 2 per sqrt km2, a village gets 1-3); second committed sample city-urbe-small.json (seed urbe-small, 800 m); both samples regeneration-tested byte-identical.

0.1.2: envelopes above 6 floors guarantee a 10.4 x 8.0 m core rectangle in the footprint (capped to 6 otherwise), machine checked; population reflects capped capacity; blueprint 0.2.2.

0.1.1: every transit route and line serves at least 2 stops, machine checked; blueprint 0.2.1.

0.1: full generator behind CONTRACT.md v0.2: tensor field street hierarchy inside an irregular boundary, blocks with sidewalk rings, OBB parcel subdivision, statistics grounded zoning with 3D envelopes, bus, subway and train networks, low poly volumetric output, invariant checks. Preview UI (pan, zoom, legend, layer toggles), generate CLI, fixed seed sample in samples/.
