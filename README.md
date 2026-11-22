# WhatsApp Decrypt

A read-only inspector for a decrypted WhatsApp `msgstore.db`. It serves chats,
per-chat message histories, group and contact chat lists, call logs, and counts
over a small JSON API, so someone who already holds their own WhatsApp backup
and key can browse the contents without opening SQLite by hand.

Two command-line utilities cover the steps before inspection: one turns a
`msgstore.db.crypt14` backup into a readable database, and the other decrypts
individual encrypted media files. The API itself only reads — it never creates
or writes the database. You bring an already-decrypted `msgstore.db`, and the
app opens it strictly read-only.

## What you can do

- List chats with their last message, or narrow the list to group chats or contact chats (`/chats`, `/group-chats`, `/contact-chats`).
- Read one chat's message history a page at a time, including media paths and quoted replies (`/chat/:id`).
- Page through the call log with timestamps, duration and video-call flags (`/calls`).
- See counts of chats, messages and calls in a single response (`/stats`).
- Turn a `msgstore.db.crypt14` backup into a readable SQLite database with the `main.py` utility.
- Decrypt one encrypted media file with `decrypt_media.py`, supplying its key and media type.

## How it works

The inspector is a small TypeScript server compiled to `dist/` and run by Node;
it opens the SQLite file read-only through `sqlite3`. The unusual part is
configuration: the database path is a required positional argument, not an
environment variable or a config file, and an optional second argument sets the
port. That choice is why the container passes arguments explicitly in its CMD
instead of relying on a `PORT` variable. A `/health` endpoint reports whether
the database is connected.

## Running it

Install the dependencies and compile the server with npm:

```sh
npm ci
npm run build
```

Point the server at a decrypted database. The port defaults to 3000 if omitted:

```sh
node dist/index.js <path-to-msgstore.db> [port]
```

To decrypt a backup first, run the utility with no arguments after placing the
backup and key where it expects them:

```sh
python main.py
```

To decrypt a single media file, pass its file, a key in Base64 or Hex, and
optionally the media type and output path:

```sh
python decrypt_media.py -b <media-key-base64> <encrypted-file>
```

## Limitations

The image bakes an empty placeholder `msgstore.db`, so a fresh container returns
"no such table" errors from every data endpoint until you mount a real decrypted
database and pass its path. There is no migration or SQL dump in the repo — the
table layout is inferred from the app's own queries, so the database you supply
must match the WhatsApp schema it expects. Every endpoint is unauthenticated
with permissive cross-origin access, making this a local inspection tool rather
than something to expose on a network. The repository also ships key, backup and
database artifacts of unknown provenance; review them before reusing or
publishing anything.

Developer notes, exact versions, the data model and operational risks are in
[TECHNICAL.md](TECHNICAL.md).
