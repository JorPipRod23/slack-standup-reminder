# Slack Standup Reminder Bot

Автоматический бот для Slack, который постит ежедневные стендапы и напоминает участникам определенной user group отписаться в треде.

## 🚀 Возможности

- **Автоматический пост стендапа** - каждое утро в указанное время
- **Умные напоминания** - пингует только тех из user group, кто не ответил
- **Гибкая настройка** - все параметры через переменные окружения
- **Поддержка приватных каналов** - работает с публичными и приватными каналами
- **Батчинг упоминаний** - группирует упоминания по 20 человек

## 📋 Требования

- Node.js 18+ 
- Slack Workspace с правами администратора
- Slack App с необходимыми разрешениями

## 🔧 Установка

### 1. Клонирование репозитория

```bash
git clone https://github.com/YOUR_USERNAME/slack-standup-reminder.git
cd slack-standup-reminder
npm install
```

### 2. Создание Slack App

1. Перейдите на https://api.slack.com/apps
2. Нажмите **Create New App** → **From scratch**
3. Введите название (например, "Standup Reminder") и выберите workspace

### 3. Настройка разрешений (OAuth & Permissions)

#### Bot Token Scopes:
- `chat:write` - отправка сообщений
- `conversations.history` - чтение истории канала
- `conversations.replies` - чтение ответов в тредах
- `channels:read` - чтение информации о публичных каналах
- `groups:read` - чтение информации о приватных каналах
- `users:read` - чтение информации о пользователях (опционально)

#### User Token Scopes (для работы с user groups):
- `usergroups:read` - чтение состава user groups
- `users:read` - чтение информации о пользователях

### 4. Установка приложения в workspace

1. В разделе **OAuth & Permissions** нажмите **Install to Workspace**
2. Разрешите запрошенные права
3. Скопируйте **Bot User OAuth Token** (начинается с `xoxb-`)
4. Скопируйте **User OAuth Token** (начинается с `xoxp-`)

### 5. Добавление бота в канал

В Slack канале выполните команду:
```
/invite @Standup Reminder
```
(используйте имя вашего приложения)

## ⚙️ Конфигурация

### Переменные окружения

Создайте файл `.env` на основе `.env.example`:

```bash
# Обязательные переменные
SLACK_BOT_TOKEN=xoxb-your-bot-token        # Bot User OAuth Token
SLACK_USER_TOKEN=xoxp-your-user-token      # User OAuth Token (для user groups)
CHANNEL_ID=G011C5ETX4Z                     # ID канала (C... или G...)
USERGROUP_ID=S09AZ861LFJ                   # ID user group

# Опциональные переменные
STANDUP_TEXT=[:mega:] [STANDUP] Ежедневный стендап...  # Текст стендап-сообщения
STANDUP_MARKER=[STANDUP]                              # Маркер для поиска стендапа
REMINDER_TEXT=Напоминание: не забыли отписаться?      # Текст напоминания
```

### Как найти ID

#### Channel ID:
1. Откройте канал в Slack
2. Нажмите на название канала вверху
3. Скопируйте Channel ID внизу попапа

#### User Group ID:
1. Откройте https://app.slack.com/client/YOUR_WORKSPACE/browse-user-groups
2. Кликните на нужную группу
3. ID будет в URL: `...usergroup/SXXXXXXXXX`

## 🚀 Запуск

### Локальный запуск для тестирования

```bash
# Постинг стендапа
npm run post-standup

# Отправка напоминаний
npm run remind
```

### Деплой на Render.com (рекомендуется)

1. Создайте аккаунт на [Render.com](https://render.com)
2. Подключите GitHub репозиторий
3. Создайте два **Cron Job**:

#### Cron Job 1: Утренний стендап
- **Name**: Standup Post
- **Command**: `node scripts/post-standup.js`
- **Schedule**: `0 10 * * 1-5` (10:00 пн-пт)
- **Timezone**: Europe/Moscow (или ваша)

#### Cron Job 2: Напоминание
- **Name**: Standup Reminder
- **Command**: `node scripts/remind.js`
- **Schedule**: `0 13 * * 1-5` (13:00 пн-пт)
- **Timezone**: Europe/Moscow (или ваша)

4. Добавьте переменные окружения в настройках каждого Cron Job

### Альтернативный деплой (GitHub Actions)

Создайте `.github/workflows/standup.yml`:

```yaml
name: Standup Reminder

on:
  schedule:
    - cron: '0 7 * * 1-5'  # 10:00 MSK (UTC+3)
    - cron: '0 10 * * 1-5' # 13:00 MSK (UTC+3)
  workflow_dispatch:

jobs:
  standup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - name: Post or Remind
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
          SLACK_USER_TOKEN: ${{ secrets.SLACK_USER_TOKEN }}
          CHANNEL_ID: ${{ secrets.CHANNEL_ID }}
          USERGROUP_ID: ${{ secrets.USERGROUP_ID }}
        run: |
          HOUR=$(date -u +%H)
          if [ "$HOUR" = "07" ]; then
            npm run post-standup
          else
            npm run remind
          fi
```

## 📊 Логика работы

### post-standup.js
1. Постит сообщение с маркером `[STANDUP]` в указанный канал
2. Сообщение становится родительским для треда со стендапами

### remind.js
1. Ищет сегодняшнее сообщение с маркером `[STANDUP]`
2. Получает список участников указанной user group
3. Проверяет, кто уже ответил в треде
4. Пингует в треде только тех из группы, кто не ответил
5. Группирует упоминания по 20 человек для избежания лимитов

## 🐛 Решение проблем

### "not_in_channel"
Бот не добавлен в канал. Используйте `/invite @BotName` в канале.

### "channel_not_found" 
- Проверьте правильность CHANNEL_ID
- Для приватных каналов (G...) нужен scope `groups:read`
- Убедитесь, что бот добавлен в канал

### "missing_scope" при работе с user groups
Используйте User Token (xoxp-) с scope `usergroups:read` вместо Bot Token.

### Бот не находит стендап-сообщение
- Проверьте, что в тексте есть маркер (по умолчанию `[STANDUP]`)
- Увеличьте лимит поиска в `conversations.history`
- Проверьте временную зону сервера

### Слишком длинное сообщение с упоминаниями
Скрипт автоматически разбивает упоминания на батчи по 20 человек.

## 🔒 Безопасность

- **Никогда** не коммитьте токены в репозиторий
- Используйте `.env` файл локально (он в `.gitignore`)
- На продакшене используйте секреты платформы (Render, GitHub Secrets, etc.)
- Регулярно ротируйте токены
- Ограничивайте права приложения минимально необходимыми

## 📝 Лицензия

MIT

## 🤝 Поддержка

При возникновении проблем создайте Issue в репозитории.
