# Design System

## Direction

Black studio stage emerging from a darker room. The full page remains nearly black and carries a fine gray dot matrix; the rounded home stage is only subtly raised, never white. One daily selected image faces Shanzoon's name and a Chinese slogan with a restrained, readable English echo. During a native-scroll passage, that image recedes and four saved visual folders rise into view. The archive statement matches the opening Chinese slogan's typographic tier, so it carries a point of view rather than behaving like annotation. The same sticky hand-off continues into `LIVE PRODUCTS`, then three layered product boards: 漫剧有数, 灵境 AI 创作平台, and Loomicc. The reference imagery remains intact as real project material rather than being redrawn as decoration.

## Color

- Outer night: `oklch(0.055 0 0)`
- Black stage: `oklch(0.075 0 0)`
- Stage ink: `oklch(0.97 0 0)`
- Stage dots: `oklch(0.76 0.01 356.8 / 0.16)`
- Night ink: `oklch(0.97 0 0)`
- Night muted: `oklch(0.70 0.008 356.8)`
- Focus: `oklch(0.82 0.14 195)`

All runtime colors are CSS custom properties in `brand.css` and use OKLCH.

## Typography

Use Futura Medium with Chinese system fallbacks. Shanzoon is the primary display-scale word on the opening frame; the slogan stays compact and balanced. Dates belong to collection and detail metadata only.

## Layout

Desktop home uses a left-copy/right-image composition within the stage. The story section is taller than the viewport, with a sticky stage for the identity-to-archive transition; native scrolling continues normally. The second frame replaces the opening identity with a compact `GENERATIVE ARCHIVE` title block: a second row aligns the personal archive statement on the left and `VIEW ALL` on the right, above four overlapping, varied-proportion folder objects. On phones that row returns to a centered stack. A matching bottom scroll cue leads directly into a single sticky product deck introduced by `LIVE PRODUCTS`. Three large boards layer over one another while earlier boards remain visible only as board edges; old comic-assets evidence images are not part of this sequence. The two public products expose verified visit links, while Loomicc is explicitly labeled as a local prototype until a public address exists. Loomicc closes into the contact links. The previous standalone systems statement and evidence-note screens are removed. Phones and reduced-motion environments receive the same three products as a static vertical sequence. The merged archive uses four equal-width masonry columns with natural image heights, reducing to two columns on phones. Detail pages fill the viewport, bottom-align image and copy beside a left-side vertical thumbnail rail, then move the rail above stacked content on narrower screens.

## Components

- `site-header`: the Shanzoon glyph and a contextual return action.
- `bright-stage`: subtly raised black home stage inside the full-page black dot matrix.
- `daily-art`: non-interactive image selected from the entire archive using the Shanghai calendar date.
- `folder-portal`: four labeled home entrances with fixed cover images and distinct shapes; pointer hover fans the cover and two category previews into a restrained three-card stack, while each click still opens the fixed cover in category-scoped detail browsing.
- `systems-story`: one sticky deck layering real previews for 漫剧有数, 灵境 AI 创作平台, and Loomicc; public products include direct visit links, Loomicc is marked as a local prototype, and the final board shares its lower edge with contact links.
- `collection-grid`: all four categories merged by newest archive date in equal-width masonry columns; dates appear as image metadata without category filters.
- `detail-page`: dedicated large-image view with bottom-aligned metadata, keyboard navigation, and a responsive thumbnail rail that is vertical on desktop and horizontal above the content on narrower screens.

## Motion

The home story maps native scroll progress to stage scale, image fade, identity crossfade, staggered folder arrival, and the `VIEW ALL` reveal. It never calls `preventDefault` or rewrites wheel behavior. The systems story extends that pacing with one scroll-driven sticky deck: product boards enter from below, covered boards shift and soften, and contacts appear with the final board. Only transform, opacity, and bounded blur are animated; links receive pointer and keyboard access only while their product is active. Pointer hover fans three category images from the selected folder without dimming its neighbors; detail transitions preserve spatial context through the selected thumbnail. Phones and `prefers-reduced-motion` users receive the same content as a static sequence.
