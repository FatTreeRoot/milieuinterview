# Seeded interview library

`interview-library.json` is the starting library: 14 interview types and 360
questions taken from Milieu's existing Word interview forms. It seeds the
database on first boot. After that the database is the source of truth, and HR
edits the library in the app.

## Regenerating it

Only needed if the original Word forms change and you want to rebuild from
scratch rather than edit in the app.

```bash
python build-library.py
```

The script expects the extracted plain text of the forms in a `txt/` directory
beside it. `.docx` files are ZIP archives, so their text comes straight out of
`word/document.xml`. Three of the forms are genuine Word 97-2003 binaries;
`doc2txt.py` reads those by walking the piece table in the OLE streams.

Answer keys are separate documents that restate each question with the points a
strong answer covers. Where a key exists it drives the question list, since it
is the richer document, and any question only the question sheet had is
appended afterwards.

Pass thresholds follow the paper forms: the internal postings state "70%
required" on the sheet, so those carry 7.0. Everything else uses the agency
default of 7.5.
