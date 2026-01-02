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
done

## [] derived variables
- which language ?

Filter:
LIKE query to be used in final query optionally.
Otherwise restrict the number of selected items.
Reset button for filter.

DateTime:
When used as cont. dimension, measures on Y doe not work, only dimensions.
(no autoscale of X in active area, for dimension that works)

Negative Bar charts
Not working
Done

Endless Undo
Done

No re-query on Size change
Done

Axis flip
Done

Move between axis -> no query
Check also color/size/label move
Done

tickStrip refactor
done

dropzone refactor
done

!!! Optimization hints do not work for cross DB tables.
Done

Fix layout of middle panel
Done, but could be improved

Dashboard mode
Per sheet chart areas combined in in one page.
Keep controls visible, when not changing query.
Data-set is unchanged. Filtering is then delegated to frontend.

Sharing feature
Store required data-set with config online.
Share sheets and/or dashboard

Tooltips not working in Fullscreen
Done

Better progress dialog
Rendering, SQL query
Works relatively well now.

Query Optimization improvements. Still cases where everything hangs, because to many data points are rendered.
Works relatively well now. Query optimization doc added.

Sheet switch destroys something
Table lost
Done

Size not correctly applied when faceting is active.
In facets (by measure) where size field is always 0, the size looks larger, than in facets where some points have 0.4
I think size is only respected within facets. Not sure here yet.

No tick strip when using DateTime as continous field only.

Shape encoding (circle, square, triangle, cross, diamond)

Ordinal type
// What Polaris suggests:
type DataType = 'nominal' | 'ordinal' | 'quantitative';
Is that really needed ?

Hierarchical/chained filters -> 2 chained time filter.

Drill Down (Year->Month->Day ...)

Zoom via UI

Expose Filters to ChartArea UI
??

Geographical Maps

Text as primary Mark -> wordcloud

Reference / Trend lines / Bands

Table calculations ?
moving avg, running total, percent of total, rank, year over year change

Category reorder by drag/drop

Manually Color assigmnets for discrete colors

Arrow columnar storage
Done

DateTime filter for multiple tables (different spans)
- consider filter in "All Time" detection

Consistent Naming for aggregates in all panels and tooltip

Tighter DateTime filter config layout

Tighter layout for Virtual columns

Gantt Charts

Filter by Selection (provide list of discrete categories involved)

Filter facet by right click into facet (select involved dimensions)

Un-share domain for dimensions at faceting.
Autoscale min..max

