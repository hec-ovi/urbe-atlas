# Underpass module

Builds a complete physical sidewalk across an elevated highway opening, including both adjoining corner owners.

`UnderpassModule.build(input)` in [index.ts](index.ts) takes [UnderpassInput](schema.ts) and returns [UnderpassTemplate](schema.ts): one module definition and its connected owner boundary. Widths and corner returns are 2, 4 or 6 m; the highway carriageway span is a positive whole metre length. Coordinates use local +X along the grade street, its paved front at Z=0 and the sidewalk interior at positive Z. The caller places or rotates the template.

Length is `startReturn + span + 1 + endReturn`. The start owner covers X=0 through `startReturn + 0.5`, Z=-0.5 through `startWidth`. The end owner covers X=`length - endReturn - 0.5` through length, Z=-0.5 through `endWidth`. Between them, the highway owner reaches Z=`min(startWidth,endWidth) + 0.5`. Paving joins the two existing corner beds with a continuous strip of the smaller width. Its end and lateral sidewalk interfaces remain open.

Disjoint supporting beds partition the owner into sidewalk, 0.2 m curb, 0.3 m gutter and roadway. One metre panel bodies have 12 mm joints above a recessed bed; curb and gutter bodies use two metre stations. The gutter's road-facing lip is 2 cm wide and high. Physical heights follow the parent module contract. Identical dimensions produce identical data.

Invalid dimensions throw `E_INVALID_PARAMS`. Unexpected disconnected ownership or non-orthogonal resolved bands throw `E_INVARIANT`.

Dependencies: [street modules](../CONTRACT.md), [geometry](../../../../geom/CONTRACT.md).
