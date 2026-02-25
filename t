curl -s -X POST http://localhost:3000/handshake/session/upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzMTYzOTlhYi00MTc1LTQ4OTYtYTYxMC1kNTJjYjk3ZDIzODUiLCJpYXQiOjE3NzE5ODExMzMsImV4cCI6MTc3MjU4NTkzM30.iIzJrt6gCpE4uMkdktNuFNKYhFq7lf2Z05PuD_OR0qA" \
  -d '{"cookies":[{"name":"foo","value":"bar","domain":".joinhandshake.com","path":"/"}]}'
