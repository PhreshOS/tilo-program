# Security

Do not disclose suspected vulnerabilities in a public issue. Contact the
maintainer privately, including the affected version, a minimal reproduction,
and the observed impact. Never include credentials or private Board content.

Tilo exposes its API through the PhreshOS service boundary. It has no separate
per-Board access-control layer: a caller allowed to access its service can read
and change all Boards. Item content is rendered as text, not HTML. Board deletion
permanently removes content and history.
