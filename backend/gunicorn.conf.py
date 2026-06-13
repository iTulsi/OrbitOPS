import os


bind = f"0.0.0.0:{os.getenv('PORT', '5050')}"

# Flask-SocketIO should use one Gunicorn process.
workers = 1

# Gunicorn 26 removed the eventlet worker.
worker_class = "gthread"
threads = int(os.getenv("GUNICORN_THREADS", "8"))

timeout = 120
keepalive = 5

accesslog = "-"
errorlog = "-"
capture_output = True
