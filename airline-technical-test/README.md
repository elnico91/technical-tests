# *Ejercicio de postulación - Aerolínea*

Una aerolínea está evaluando comenzar sus operaciones en países de Latinoamérica. Para esto, necesita saber si es posible realizar un check-in automático de sus pasajeros.

## Variables de entorno

Para ejecutar este proyecto, deberá agregar las siguientes variables de entorno a su archivo .env

```bash { interactive=true }
DB_HOST='<database_host_url>'
DB_USER='<database_user>'
DB_PASSWORD='<database_password>'
DB_DATABASE='<database>'

```

## API

#### Obtener vuelo

```http
  GET flights/:id/passengers
```

| Parámetro | Tipo     | Descripción                       |
| :-------- | :------- | :-------------------------------- |
| `id`      | `number` | **Requerido**. Id del vuelo a buscar |

## Ejecutar de forma local

Clonar el proyecto

```bash
  git clone https://github.com/elnico91/bsale-technical-test.git

```

Ir al directorio del proyecto

```bash
  cd airline-technical-test

```

Instalar dependencias

```bash
  npm install

```

Iniciar el servidor

```bash
  npm run start

```

## Tecnologías usadas

**Server:** NodeJS y Express.

**Dependencias:** express, mysql2 y dotenv.

## Modelo relacional de la base de datos

![DB](https://i.imgur.com/XafFJdS.png)
