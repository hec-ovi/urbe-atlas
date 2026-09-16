# Underpass module

Builds a complete physical sidewalk across an elevated highway opening, including both adjoining corner owners.

`UnderpassModule.build(input)` in [index.ts](index.ts) takes [UnderpassInput](schema.ts) and returns [UnderpassTemplate](schema.ts): one module definition and its connected owner boundary. Omitted `format` selects source widths and corner returns of 2/4/6 m with a positive whole-metre highway span. District format requires physical widths and returns of 4.2 m, including the separator, with a positive span in 0.2 m increments. Coordinates use local +X along the grade street, its paved front at Z=0 and the sidewalk interior at positive Z. The caller places or rotates the template.

The outer rim is 0.5 m for source and 0.7 m for district. Length is `startReturn + span + 2 * rim + endReturn`. The start owner covers X=0 through `startReturn + rim`, Z=`-rim` through `startWidth`. The end owner covers X=`length - endReturn - rim` through length, Z=`-rim` through `endWidth`. Between them, the highway owner reaches Z=`min(startWidth,endWidth) + rim`. Paving joins the two existing corner beds with a continuous strip of the smaller physical width. Its end and lateral sidewalk interfaces remain open.

Disjoint supporting beds partition the owner into sidewalk, 0.2 m curb, gutter and roadway. Gutters are 0.3 m for source and 0.5 m for district. One metre panel bodies have 12 mm joints above a recessed bed, with fitted terminal panels at fractional owner edges. Curb and gutter bodies use two metre stations. The gutter's road-facing lip is 2 cm wide and high. Physical heights follow the parent module contract. Identical dimensions produce identical data.

Invalid dimensions throw `E_INVALID_PARAMS`. Unexpected disconnected ownership or non-orthogonal resolved bands throw `E_INVARIANT`.

Dependencies: [street modules](../CONTRACT.md), [geometry](../../../../geom/CONTRACT.md).
