# Diagonal block module

Constructs one local block template containing a straight 30 or 45 degree street cut.

`DiagonalBlock.build(input)` takes [DiagonalBlockInput](schema.ts) and returns [DiagonalBlockTemplate](schema.ts): physical prisms, two buildable land regions and the cut's line equation. Coordinates are local metres; the caller translates the template and joins the street graph.

The cut joins adjacent sides of the rectangular owner. Road width is a whole metre value for one or two lanes. Sidewalk widths are 2, 4 or 6 m. Road-facing returns have a 2.5 m radius, giving the paved corner its 2 m radius. Full straight runs use repeated 1 m panels and 2 m curb/gutter groups. Fitted junction pieces share their station boundaries. Curb, gutter and lip dimensions follow the parent module contract. Geometry remains on the millimetre construction grid.

A template is built once for its dimensions. All loops are bounded by its edges, panel counts and fixed corner cells. Invalid dimensions use `E_INVALID_PARAMS`; insufficient corner or building land uses `E_UNSATISFIABLE`.

Supporting beds partition each nested contour through existing vertices. `partitionedBeds` lets the planning cover consume these physical outlines directly. Beds and the two interiors own the complete rectangle once, with shared boundary coordinates.

Dependencies: [street modules](../CONTRACT.md), [geometry](../../../../geom/CONTRACT.md).
