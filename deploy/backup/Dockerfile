FROM postgres:16-alpine
RUN apk add --no-cache rclone curl tzdata
COPY backup.sh restore.sh schedule.sh /scripts/
RUN chmod +x /scripts/*.sh
CMD ["/scripts/schedule.sh"]
