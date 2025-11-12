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

Negative Bar charts
Not working

Endless Undo
Done