# -*- coding: utf-8 -*-
"""
WSGI entry для PythonAnywhere.

Вкладка Web → настройки приложения → «WSGI configuration file»:
укажите путь к ЭТОМУ файлу, например:
  /home/ВАШ_ЮЗЕР/food-planner/backend/pythonanywhere_wsgi.py

Ошибка «module has no attribute application» возникает, если в WSGI-файле
нет строки вида: application = <flask_app>.
"""
import os
import sys

# Папка backend/ (рядом с app.py)
_BACKEND = os.path.dirname(os.path.abspath(__file__))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from app import app as application  # noqa: E402

# Генерация плана (/api/plan/generate) держит соединение до ~90 с (запрос к OpenRouter).
# На PythonAnywhere веб-запрос обрывается примерно через 100 с — не увеличивайте retry/timeout в deepseek
# для weekly plan без необходимости. После деплоя: Web → Reload.
