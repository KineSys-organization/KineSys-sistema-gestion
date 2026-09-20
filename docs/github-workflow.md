# Workflow de Git y GitHub — KineSys

Este documento explica cómo trabajamos en el repositorio. Es la referencia
práctica del día a día; el Product Backlog formal (criterios, SP, reglas de
negocio) vive en el Excel académico, no acá.

## Ramas

```
main
 └── develop
      └── feature/HU-XX-descripcion
```

- **`main`** — versión estable del producto. No recibe trabajo de
  funcionalidades directamente; solo recibe merges de `develop` al cerrar un
  incremento, vía Pull Request.
- **`develop`** — rama de integración del incremento actual. Las HU
  terminadas se integran acá mediante Pull Request.
- **`feature/HU-XX-descripcion`** — una rama por Historia de Usuario, creada
  a partir de `develop`. Convención de nombre:
  - `feature/HU-01-definir-servicios`
  - `feature/HU-05-consultar-disponibilidad`
  - `feature/HU-13-registrar-atencion`

## Cómo empezar una HU

1. Elegí una HU en estado **Ready** del tablero.
2. Movela a **In Progress**.
3. Actualizá tu `develop` local: `git checkout develop && git pull`.
4. Creá la rama: `git checkout -b feature/HU-XX-descripcion`.
5. Desarrollá, con commits siguiendo la convención de abajo.
6. `git push -u origin feature/HU-XX-descripcion`.

## Cómo crear un Pull Request

- Destino: siempre `develop` (nunca `main` directamente).
- Usá el template de PR (se completa automáticamente).
- Relacioná la Issue de la HU con `Closes #N` (si el merge cierra la
  historia) o `Refs #N` (si es un avance parcial).
- Pedí revisión de al menos un integrante del equipo.
- Resolvé todos los comentarios antes de mergear.

## Cómo pasar una HU por el tablero

`Product Backlog → Ready → In Progress → In Review → Done`

- **In Review**: cuando el PR está abierto y esperando revisión.
- **Done**: cuando el PR fue mergeado a `develop` y los criterios de
  aceptación están cumplidos.

## Cuándo cerrar la Issue

Cuando el PR se mergea a `develop` con `Closes #N`, GitHub la cierra
automáticamente. Si no se usó `Closes`, cerrala manualmente una vez
verificados los criterios de aceptación (ver checklist "Evidencia" en la
Issue).

## Cierre de un incremento

Cuando todas las HU comprometidas de un incremento están en `develop`:

1. Pull Request de `develop` hacia `main`.
2. Revisión y merge.
3. Se puede generar un tag (`incremento-1`, `incremento-2`, `incremento-3`)
   sobre ese commit de `main`, una vez que la entrega está efectivamente
   terminada.

## Convención de commits (Conventional Commits adaptado)

```
feat(HU-05): calcular horarios disponibles
fix(HU-06): evitar solapamiento de turnos
test(HU-13): agregar pruebas de registro de atención
docs(HU-08): documentar permisos por rol
refactor(HU-14): simplificar servicio de pagos
chore: configurar templates de GitHub
```

- El scope entre paréntesis es la HU cuando el commit corresponde a una
  historia puntual.
- `chore:` para cambios generales que no pertenecen a una HU (configuración,
  tooling, etc.), sin scope.
- No se fuerza esto con tooling adicional (no hay commitlint/husky en el
  repo); es una convención de equipo.

## Convención de nombres

| Elemento        | Convención                              | Ejemplo                              |
| ---------------- | ---------------------------------------- | ------------------------------------- |
| Rama feature      | `feature/HU-XX-descripcion-corta`        | `feature/HU-06-otorgar-turno`         |
| Tag de incremento | `incremento-N`                           | `incremento-1`                        |
| Título de Issue   | `[HU-XX] Título de la historia`          | `[HU-06] Otorgar turno a un paciente` |
| Commit            | `tipo(HU-XX): descripción en minúsculas` | `feat(HU-06): otorgar turno`          |

## Resumen del flujo

1. Elegir HU en **Ready**.
2. Mover a **In Progress**.
3. Actualizar `develop`.
4. Crear `feature/HU-XX-descripcion`.
5. Desarrollar.
6. Commits asociados a la HU.
7. Push.
8. PR hacia `develop`.
9. Mover a **In Review**.
10. Revisión de otro integrante.
11. Merge.
12. Validar criterios de aceptación.
13. Cerrar la Issue.
14. Mover a **Done**.
