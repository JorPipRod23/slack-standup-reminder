# Исправление проблемы с Timetastic интеграцией

## Проблема
Бот отправлял напоминания людям в отпуске (конкретно Дарье Богатырковой 18 августа 2025).

## Найденные причины

1. **Отсутствие scope `users:read.email` в Slack App**
   - Бот не мог видеть email адреса пользователей
   - Решение: Добавлен scope в настройках Slack App

2. **Проблема с axios библиотекой**
   - axios возвращал HTML страницу ошибки вместо JSON
   - Решение: Создана новая версия клиента `timetastic-native.js` на нативном https

3. **Различие в написании фамилий**
   - В Slack: Daria Bogatyrkova
   - В Timetastic: есть две Дарьи:
     - Daria Bogatyreva (daria@wert.io) - другой человек
     - Daria Bogatyrkova (daria.bogatyrkova@wert.io) - нужный человек
   - Решение: Добавлен fuzzy matching по имени как fallback

## Внесенные изменения

### 1. Новая библиотека `lib/timetastic-native.js`
- Использует нативный https вместо axios
- Корректно обрабатывает JSON ответы от API
- Поддерживает поиск по email и имени с fuzzy matching

### 2. Обновлен `scripts/remind-enhanced.js`
- Импортирует `timetastic-native.js` вместо `timetastic.js`
- Передает и email, и имя в функцию `isUserWorking()`
- Убрана проверка на отсутствие email (теперь используется имя как fallback)

### 3. Добавлены права в Slack App
- Scope `users:read.email` для доступа к email адресам

## Результат

✅ **Система теперь корректно работает:**
- Определяет, что Daria Bogatyrkova в отпуске (Holiday) с 18 по 22 августа
- НЕ отправляет ей напоминания о стендапе
- Правильно сопоставляет пользователей Slack с Timetastic по email

## Тестирование

```bash
# Проверка интеграции
node test-complete.js

# Проверка конкретно для Дарьи
node test-daria-specific.js

# Запуск полного скрипта
SLACK_BOT_TOKEN="..." CHANNEL_ID="G011C5ETX4Z" USERGROUP_ID="S09AZ861LFJ" TIMETASTIC_API_KEY="..." node scripts/remind-enhanced.js
```

## Важные замечания

1. Email в Timetastic должен совпадать с email в Slack профиле
2. Если email недоступен, система пытается найти по имени (с учетом возможных опечаток)
3. Типы отпусков, при которых НЕ отправляются напоминания:
   - Holiday
   - Sick Leave
   - Day off
4. При типах Remote, Office и т.д. - напоминания отправляются (человек работает)
