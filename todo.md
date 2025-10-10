# TODO List

## vertical line chart not always correct
Problem config: discrete dimension on X axis and an cont. measure on the same axis, and a continous dimension on Y axis
Expecation: Vertically faceted chart, each chart should a vertical line chart.
Actual result: Horizontal line chart. Fields are flipped on the axes. Cont. measure is now on Y axis and vice versa.

## Fix layout of Color section
- Field chip is centered, should be left aligned
- there is more spacing than in Filter section
- look and feel should be the same for all panels in that middle area

## Filter section sorting
- sort values alphabetically (discrete values)

## Filter section layout fix
- make item list more dense and smaller font

## Filter section number fields
- number fields have a strange offset in frames (add screenshot)

## Filter section filter string - regex
- support regex for filter string (optional)

## Clickhouse DB selector - first attempt error
- when using CH and switch to Viz page, there is red error, need to switch back and forth
