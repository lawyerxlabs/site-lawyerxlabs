# Build context: /mnt/docker-ssd/romeshh/sites
#   docker build -f site-lawyerlab/waitlist-server/Dockerfile -t waitlist .
FROM python:3.12-alpine

RUN adduser -D -u 10001 app \
    && mkdir /data \
    && chown app:app /data

WORKDIR /app
COPY layer-forms/src/layer_forms /app/layer_forms
COPY site-lawyerlab/waitlist-server/*.py /app/

ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    WAITLIST_HOST=0.0.0.0 \
    WAITLIST_PORT=7400 \
    WAITLIST_DB=/data/waitlist.sqlite3

VOLUME /data
EXPOSE 7400
USER app
CMD ["python", "server.py"]
