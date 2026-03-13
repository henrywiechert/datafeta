# TODO List

## [DONE] vertical line chart not always correct
Problem config: discrete dimension on X axis and an cont. measure on the same axis, and a continous dimension on Y axis
Expecation: Vertically faceted chart, each chart should a vertical line chart.
Actual result: Horizontal line chart. Fields are flipped on the axes. Cont. measure is now on Y axis and vice versa.

## [DONE] Fix layout of Color section
- Field chip is centered, should be left aligned
- there is more spacing than in Filter section
- look and feel should be the same for all panels in that middle area

## [DONE] Filter section sorting
- sort values alphabetically (discrete values)

## [DONE] Filter section layout fix
- make item list more dense and smaller font

## [DONE] Filter section number fields
- number fields have a strange offset in frames (add screenshot)

## [DONE] Filter section filter string - regex
- support regex for filter string (optional)

## Clickhouse DB selector - first attempt error
- when using CH and switch to Viz page, there is red error, need to switch back and forth

## [DONE] Right scrollbar not touchable
- not selectable by mouse

## [DONE] Continous dimension for color
- gradient feature

## [DONE] add all used fields to tooltip
- add color + size when present
- add panel for additional fields for tooltips
- huger scatter data -> reduce data (remove duplicated pairs)

## [] derived variables
- which language ?
- what is meant here - basic virtual columns exist ?
- great feature would be an integrated notebook to work on selected dataset.

## [] Filter
- LIKE query to be used in final query optionally.
- Otherwise restrict the number of selected items.
- Reset button for filter.

## [] DateTime
- When used as cont. dimension, measures on Y doe not work, only dimensions.
- (no autoscale of X in active area, for dimension that works)
- I think that is no longer a problem. To be checked.

## [DONE] Negative Bar charts
- Not working

## [DONE] Endless Undo

## [DONE] No re-query on Size change

## [DONE] Axis flip

## [DONE] Move between axis -> no query
- Check also color/size/label move

## [DONE] tickStrip refactor

## [DONE] dropzone refactor

## [DONE] !!! Optimization hints do not work for cross DB tables.

## [DONE] Fix layout of middle panel
- Done, but could be improved

## [] Dashboard mode
- Per sheet chart areas combined in in one page.
- Keep controls visible, when not changing query.
- Data-set is unchanged. Filtering is then delegated to frontend.

## [] Sharing feature
- Store required data-set with config online.
- Share sheets and/or dashboard via link
- different tiers of data availability
    - full data source access
    - shared sheet bound to single data source
    - sheet bound to selected filters data (data stored with the sheet)

## [DONE] Tooltips not working in Fullscreen

## [] Better progress dialog
- Rendering, SQL query
- Works relatively well now.

## [] Query Optimization improvements. Still cases where everything hangs, because to many data points are rendered.
- Works relatively well now. Query optimization doc added.

## [] Sheet switch destroys something
- Table lost
- Still virtual columns are sheet specific, they should be per session

## [] Size not correctly applied when faceting is active.
- In facets (by measure) where size field is always 0, the size looks larger, than in facets where some points have 0.4
- I think size is only respected within facets. Not sure here yet.

## [DONE] No tick strip when using DateTime as continous field only.

## [] Shape encoding (circle, square, triangle, cross, diamond)

## [] Ordinal type
- // What Polaris suggests:
- type DataType = 'nominal' | 'ordinal' | 'quantitative';
- Ordinal would be ordered but strings (High, Medium, Low)
- Is that really needed ? Tableau does not have it.

## [] Hierarchical/chained filters -> 2 chained time filter.

## [] Drill Down (Year->Month->Day ...)

## [] Zoom via UI

## [] Expose Filters to ChartArea UI

## [] Geographical Maps

## [] Text as primary Mark -> wordcloud
- Generally apply the concept of alwayas having a primary mark

## [] Reference / Trend lines / Bands

## [] Table calculations ?
- moving avg, running total, percent of total, rank, year over year change

## [] Category reorder by drag/drop
- Reorder for bar charts present in pop up on axis.

## [] Manually Color assigmnets for discrete colors

## [DONE] Arrow columnar storage

## [] DateTime filter for multiple tables (different spans)
- consider filter in "All Time" detection

## [] Consistent Naming for aggregates in all panels and tooltip
- support aliases maybe

## [DONE] Tighter DateTime filter config layout

## [DONE] Tighter layout for Virtual columns

## [DONE] Gantt Charts

## [] Filter by Selection (provide list of discrete categories involved)

## [] Filter (or Zoom) facet by right click into facet

## [] UI driven filters (right click on data point, show all involved filterable categories, select the ones that shall match to selection)

## [DONE] Un-share domain for dimensions at faceting.
- Autoscale min..max
- buttons now available in chart area to unlink domains on X/Y

## [] Add better viz for facets
- e.g. show alias as overlay per facet row/column

## [] Add legend stack to fullscreen view

## [] Hierarchical colors
- discrete color as primary grouping
- continous color per group

## [] Discrete Filter for Many elements
- rnti SQL like search does not work

## [] Gantt chart width ends with start of last event
- should be start + size + margin

## [] Explicit removal of zoom filter does not trigger query
- should trigger

## [] Todo across sheets
- remember todo per sheet, also when sheet changes

## [] Zoom: remember zoom across sheets (zoom is global config?)
- Use case: Zoom in, change sheet, switch back, Undo should now revert zoom action
