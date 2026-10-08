# Workbook test fixtures

Formats the test suite cannot write itself (openpyxl only writes .xlsx):

- `legacy.xls` (written with xlwt): sheet `Data` has a title row, a blank row,
  then the header `id, label, when, code`; `when` is date-formatted and `code`
  mixes numbers with the text `X30`. Sheet `Notes` has one column `note`.
- `sample.ods` (written with pandas + odfpy): sheet `Values` (`id`, `value`,
  `flag`) and sheet `Cities` (`city`).

There is no `.xlsb` fixture: no Python library writes that format.
