# Hito 1: Definicion MVP y modelo de datos

## Pantallas MVP
1) Seleccion de sorteo + grupo.
2) Alta de boleto con numeros y resguardo.

## Flujo principal
1) Usuario elige sorteo y grupo.
2) Crea boleto con una o varias lineas.
3) Adjunta resguardo (foto) opcional.
4) Estado inicial: PENDIENTE.

## Entidades y campos minimos
### Group
- id (cuid)
- name (string)
- kind (AMIGOS | TRABAJO | PAREJA)

### Draw
- id (cuid)
- type (PRIMITIVA | EUROMILLONES)
- drawDate (date)
- label (opcional)

### Ticket
- id (cuid)
- groupId (FK)
- drawId (FK)
- status (PENDIENTE | COMPROBADO | PREMIO)
- priceCents (opcional)
- notes (opcional)

### TicketLine
- id (cuid)
- ticketId (FK)
- lineIndex (1..N)
- complement (opcional, Primitiva)
- reintegro (opcional, Primitiva)

### TicketLineNumber
- id (cuid)
- lineId (FK)
- kind (MAIN | STAR)
- position (1..N)
- value (int)

### Receipt
- id (cuid)
- ticketId (FK, unique)
- blobUrl (string)
- blobPath (opcional)
- mimeType (opcional)
- sizeBytes (opcional)

## Validaciones funcionales
- Group.name obligatorio y no vacio.
- Draw debe ser unico por type + drawDate.
- Ticket requiere groupId + drawId.
- TicketLine.lineIndex empieza en 1 y es consecutivo.
- Primitiva:
  - MAIN: 6 numeros entre 1-49, sin repetidos.
  - complement: 1-49, distinto de MAIN.
  - reintegro: 0-9.
- Euromillones:
  - MAIN: 5 numeros entre 1-50, sin repetidos.
  - STAR: 2 numeros entre 1-12, sin repetidos.
- TicketLineNumber.position consecutivo por kind.
- Receipt solo si hay blobUrl valido.

## Estados
- PENDIENTE: creado, sin comprobar.
- COMPROBADO: revisado, sin premio.
- PREMIO: premio detectado (importe pendiente si aplica).
