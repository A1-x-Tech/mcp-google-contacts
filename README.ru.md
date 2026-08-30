# <img src="./assets/a1-logo.svg" alt="A1" width="40"> Google Contacts MCP

[English](./README.md) | **Русский**

[![npm](https://img.shields.io/npm/v/mcp-google-contacts)](https://www.npmjs.com/package/mcp-google-contacts)
[![CI](https://github.com/A1-x-Tech/mcp-google-contacts/actions/workflows/ci.yml/badge.svg)](https://github.com/A1-x-Tech/mcp-google-contacts/actions/workflows/ci.yml)
[![Glama](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-contacts/badges/score.svg)](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-contacts)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**A1 Google Contacts MCP** позволяет AI-приложению управлять вашей адресной книгой Google на естественном языке. Можно найти контакт, создать или обновить его, разложить контакты по ярлыкам, выполнить пакетный импорт и чистку и превратить автосохранённые «Другие контакты» в настоящие.

Сервер работает с Google People API — API, на котором построены Google Контакты, — через ваш Google-аккаунт. Он защищает каждое обновление от параллельных правок, делает чтение компактным за счёт явных масок полей и явно показывает ограничения People API, а не создаёт впечатление, что с контактами можно сделать всё.

- **19 инструментов.** Список, поиск и чтение контактов, создание, обновление и удаление по одному или пакетами, управление группами контактов и их составом, доступ к «Другим контактам».
- **Обновления не затирают чужие правки.** Каждое обновление защищено etag: если контакт изменился где-то ещё после чтения, запись завершится ошибкой, а не молча перезапишет параллельную правку.
- **Удаление — настоящее.** В People API нет корзины; удаление контакта или группы необратимо, и сервер помечает эти инструменты как разрушительные, чтобы AI-приложение спросило заранее.
- **Минимальные scope Google.** Используется `contacts` для чтения и записи — для read-only-установки достаточно `contacts.readonly` — плюс `contacts.other.readonly` только для «Других контактов», без широкого доступа к аккаунту.

Начните с запроса, который только читает данные:

> Найди в моих контактах всех из Acme и покажи их email и телефоны.

[Подключить сервер](#быстрый-старт) · [Посмотреть сценарии](#что-можно-поручить) · [Открыть техническую документацию](#техническая-документация)

---

## Увидеть работу за минуту

> **Вы:** Покажи карточку контакта Jane Doe — email, телефон и компанию.
>
> **Ассистент:** Находит контакт и показывает запрошенные поля. Ничего не меняется.
>
> **Вы:** Поменяй её телефон на +1 415 555 0100 и добавь её в ярлык «Клиенты».
>
> **Ассистент:** Показывает контакт и предлагаемое изменение, затем запрашивает подтверждение перед записью.
>
> **Вы:** Подтверждаю.
>
> **Ассистент:** Применяет обновление под защитой etag и добавляет ярлык. Если контакт за это время изменился где-то ещё, запись завершится ошибкой, а не перезапишет правку.

## Содержание

- [Быстрый старт](#быстрый-старт)
- [Что можно поручить](#что-можно-поручить)
- [Как меняется контакт](#как-меняется-контакт)
- [Что может измениться](#что-может-измениться)
- [Как получить доступ](#как-получить-доступ)
- [Конфигурация](#конфигурация)
- [Данные, лимиты и работа в фоне](#данные-лимиты-и-работа-в-фоне)
- [Техническая документация](#техническая-документация)
- [Поддержка](#поддержка)

## Быстрый старт

Нужны Node.js 20+, Google-аккаунт и OAuth-данные из проекта Google Cloud с включённым People API.

1. [Подготовьте Google OAuth-доступ](#как-получить-доступ).
2. Добавьте сервер в AI-приложение.
3. Отправьте запрос, который только читает данные.

<details open>
<summary><strong>Codex</strong></summary>

<br>

**В приложении:** откройте **Settings → Plugins → MCP servers**, нажмите **Add server**, затем добавьте `npx -y mcp-google-contacts@latest` с `GOOGLE_CONTACTS_CLIENT_ID`, `GOOGLE_CONTACTS_CLIENT_SECRET` и `GOOGLE_CONTACTS_REFRESH_TOKEN`.

**В командной строке:**

```bash
codex mcp add google-contacts \
  --env GOOGLE_CONTACTS_CLIENT_ID=your_client_id \
  --env GOOGLE_CONTACTS_CLIENT_SECRET=your_client_secret \
  --env GOOGLE_CONTACTS_REFRESH_TOKEN=your_refresh_token \
  -- npx -y mcp-google-contacts@latest
```

```bash
codex mcp list
```

[Документация Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

</details>

<details>
<summary><strong>Claude Code</strong></summary>

<br>

```bash
claude mcp add \
  --env GOOGLE_CONTACTS_CLIENT_ID=your_client_id \
  --env GOOGLE_CONTACTS_CLIENT_SECRET=your_client_secret \
  --env GOOGLE_CONTACTS_REFRESH_TOKEN=your_refresh_token \
  --transport stdio --scope user google-contacts \
  -- npx -y mcp-google-contacts@latest
```

```bash
claude mcp list
```

[Документация Claude Code MCP](https://code.claude.com/docs/en/mcp)

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

<br>

Откройте **Settings → Developer → Edit Config** и добавьте:

```json
{
  "mcpServers": {
    "google-contacts": {
      "command": "npx",
      "args": ["-y", "mcp-google-contacts@latest"],
      "env": {
        "GOOGLE_CONTACTS_CLIENT_ID": "your_client_id",
        "GOOGLE_CONTACTS_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_CONTACTS_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

Если **Edit Config** недоступна, отредактируйте `~/Library/Application Support/Claude/claude_desktop_config.json` на macOS или `%APPDATA%\Claude\claude_desktop_config.json` на Windows.

[Документация Claude Desktop MCP](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

</details>

<details>
<summary><strong>Cursor</strong></summary>

<br>

Добавьте в `~/.cursor/mcp.json` на macOS/Linux или `%USERPROFILE%\.cursor\mcp.json` на Windows:

```json
{
  "mcpServers": {
    "google-contacts": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-google-contacts@latest"],
      "env": {
        "GOOGLE_CONTACTS_CLIENT_ID": "your_client_id",
        "GOOGLE_CONTACTS_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_CONTACTS_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

[Документация Cursor MCP](https://cursor.com/docs/mcp)

</details>

<details>
<summary><strong>VS Code</strong></summary>

<br>

Запустите **MCP: Open User Configuration** и добавьте:

```json
{
  "servers": {
    "google-contacts": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-google-contacts@latest"],
      "env": {
        "GOOGLE_CONTACTS_CLIENT_ID": "${input:contacts_client_id}",
        "GOOGLE_CONTACTS_CLIENT_SECRET": "${input:contacts_client_secret}",
        "GOOGLE_CONTACTS_REFRESH_TOKEN": "${input:contacts_refresh_token}"
      }
    }
  },
  "inputs": [
    { "type": "promptString", "id": "contacts_client_id", "description": "Google OAuth client ID" },
    { "type": "promptString", "id": "contacts_client_secret", "description": "Google OAuth client secret", "password": true },
    { "type": "promptString", "id": "contacts_refresh_token", "description": "Google OAuth refresh token", "password": true }
  ]
}
```

Проверьте сервер командой **MCP: List Servers**.

[Документация VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

</details>

## Что можно поручить

### Найти и посмотреть контакты

- Найди всех из Acme и покажи их email и телефоны.
- Покажи, кто входит в ярлык «Клиенты».
- Выведи контакты, изменившиеся с прошлой синхронизации.

### Поддерживать адресную книгу в порядке

- Создай контакт Jane Doe с email, телефоном и компанией.
- Обнови телефон или должность контакта.
- Импортируй пятьдесят человек одним пакетом или удали устаревшие контакты одним вызовом.

### Наводить порядок с ярлыками

- Создай ярлык «Клиенты» и добавь в него эти контакты.
- Переименуй ярлык или перенеси контакт из одного ярлыка в другой.
- Удали ярлык, не удаляя его контакты, — или вместе с ними, но только по явной просьбе.

### Работать с «Другими контактами»

- Покажи адреса, которые Google сохранил автоматически, но которых нет в моих контактах.
- Скопируй один из них в «Мои контакты» как настоящий контакт.

## Как меняется контакт

1. У каждого контакта, группы и «другого контакта» есть полное **имя ресурса** (`people/c...`, `contactGroups/...`, `otherContacts/...`); инструменты адресуют записи по нему, ровно в том виде, в каком его возвращает API.
2. Чтение возвращает только поля из **маски полей** (по умолчанию: имена, email, телефоны, организации, членство в группах). Отсутствующее поле может быть просто вне маски, а не пустым.
3. Обновление **заменяет** каждую переданную группу полей целиком и защищено **etag**: если контакт изменился где-то ещё после чтения, запись завершится ошибкой, а не перезапишет параллельную правку.
4. Удаление необратимо. В People API нет корзины и отмены.

Поиск работает по кэшу, который может отставать от свежих записей на несколько секунд, и возвращает не более 30 результатов. «Другие контакты» — адреса, которые Google сохраняет автоматически, — можно только читать или копировать в «Мои контакты», но не редактировать на месте. Для фотографий контактов отдельного инструмента нет; до этих эндпоинтов достаёт `raw_request`.

## Что может измениться

| Операция | Что происходит | Граница подтверждения |
|---|---|---|
| Чтение, поиск или пакетное чтение контактов и групп | Читает данные контактов | Ничего не меняет |
| Создание контакта, группы или пакета контактов | Добавляет записи | Меняет Google Контакты |
| Обновление контакта или переименование группы | Заменяет переданные группы полей, под защитой etag | Меняет контакт |
| Изменение состава ярлыка | Добавляет или снимает ярлык у выбранных контактов | Меняет контакты |
| Копирование «другого контакта» | Добавляет настоящий контакт в «Мои контакты» | Меняет Google Контакты |
| Удаление контакта, группы или пакета | Удаляет записи безвозвратно; удаление группы удаляет её контакты только по явному запросу | Разрушительно |
| Технический запрос API | Может вызвать метод API без отдельного инструмента | Потенциально разрушительно |

Как AI-приложение просит подтверждение, определяет само приложение. Сервер помечает операции чтения, записи и удаления, чтобы оно отличило проверку от рабочего изменения.

## Как получить доступ

Google Контакты требуют OAuth 2.0: одного API-ключа недостаточно.

1. Создайте или выберите проект Google Cloud и включите **People API**.
2. Настройте OAuth consent screen и создайте OAuth-клиент типа **Desktop app**.
3. Авторизуйте Google-аккаунт, контактами которого хотите управлять. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) поможет получить refresh token, если включить **Use your own OAuth credentials**.
4. Запросите минимальные scope под свои задачи:

   ```text
   https://www.googleapis.com/auth/contacts
   https://www.googleapis.com/auth/contacts.other.readonly
   ```

`contacts` покрывает чтение и запись контактов и групп; для read-only-установки достаточно одного `contacts.readonly`. `contacts.other.readonly` нужен только инструментам «Других контактов». Ошибка `403` на одном инструменте обычно означает, что refresh token выпущен без нужного этому инструменту scope, — пройдите авторизацию заново, добавив недостающий scope.

Refresh token OAuth-приложения в режиме Testing может истечь через семь дней. Для долгого доступа опубликуйте OAuth-приложение или используйте Internal-приложение в домене Workspace. Храните client secret и refresh token как пароли.

## Конфигурация

| Переменная | Обязательна | Описание |
|---|---|---|
| `GOOGLE_CONTACTS_CLIENT_ID` | Да* | OAuth client ID. |
| `GOOGLE_CONTACTS_CLIENT_SECRET` | Да* | OAuth client secret. |
| `GOOGLE_CONTACTS_REFRESH_TOKEN` | Да* | OAuth refresh token. |
| `GOOGLE_CONTACTS_ACCESS_TOKEN` | Да* | Короткоживущая альтернатива OAuth-тройке (~1 ч). |
| `GOOGLE_CONTACTS_API_BASE` | Нет | Переопределяет базовый URL Google People API. |
| `GOOGLE_CONTACTS_TIMEOUT_MS` | Нет | Тайм-аут одного запроса; по умолчанию `60000` мс. |
| `GOOGLE_CONTACTS_MAX_RETRIES` | Нет | Повторы временных ошибок; по умолчанию `3`. |

\* Передайте OAuth-тройку или access token. Совсем без учётных данных сервер всё равно стартует и завершает MCP-handshake; первый же вызов инструмента назовёт, какие именно переменные задать.

## Данные, лимиты и работа в фоне

- **Запросы идут в Google.** Локальный сервер обновляет OAuth-токены Google и вызывает People API на `people.googleapis.com`. Анонимная телеметрия содержит ID установки, версию пакета, версии AI-клиента и платформы и имена инструментов — но не OAuth-токены, данные контактов, аргументы или промпты. Чтобы отключить её, задайте `ASKADS_TELEMETRY=0`.
- **Квоты Google — на пользователя и небольшие.** Квота People API по умолчанию даёт примерно 90 чтений и 90 записей на пользователя в минуту, поэтому пакетные инструменты выгоднее циклов одиночных вызовов; изменяющие пакеты нужно выполнять по одному. При `429` сервер делает паузу и повторяет; чтение также повторяется после сетевых и `5xx` ошибок, а запись после неопределённой ошибки не повторяется.
- **Постоянного опроса нет.** Сервер работает только при вызове. `list_contacts` поддерживает sync-токены, поэтому AI-приложение с заданиями по расписанию может периодически забирать только изменения; sync-токен истекает примерно через семь дней, после чего нужно заново получить полный список.

## Техническая документация

- [Каталог MCP-возможностей](./docs/capabilities/index.md) — страницы по пользовательским задачам для каждого инструмента.
- [Все инструменты и параметры](./docs/TOOLS.md)
- [Документация по разработке](./docs/DEVELOPMENT.md)
- [Документация по публикации](./docs/PUBLISHING.md)
- [Справочник Google People API](https://developers.google.com/people)

## Поддержка

Нашли ошибку или не хватает сценария? [Создайте issue](https://github.com/A1-x-Tech/mcp-google-contacts/issues) или напишите в [Telegram](https://t.me/a1_mcp).

<br>

<p align="center">
  <img src="https://github.com/ztemerbekov/a1-yandex-kit-skills/raw/main/assets/images/mona-hifive-yandex-kit-warm.gif" alt="Две Моны дают пять" width="256">
</p>

<p align="center">
  Вы дочитали до конца!
</p>
