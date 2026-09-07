# Book library

Place your book PDFs in this folder (`media/books/`). They are described by
[`../books.json`](../books.json), where each entry's `pdfUrl` is relative to the
media root, e.g. `"pdfUrl": "books/my-book.pdf"`.

The PDFs previously hosted on AWS CloudFront can be re-downloaded from the
original distribution and dropped here:

- `1-L.2-BathtubSafari.pdf`
- `2-L.3-TheLionwhoWouldntTry.pdf`
- `3-L.3-MonkeyBusiness.pdf`

Anything placed here is served (locally) by the Python media server at
`http://localhost:8766/books/<file>` — or, in Docker, via Nginx at `/media/books/<file>`.

> PDFs are intentionally git-ignored (`media/books/*.pdf` in `.gitignore`) —
> commit only `books.json` and other small metadata.
