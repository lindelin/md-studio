FROM alpine:3

RUN apk add busybox-extras tini

COPY dist/ minidisc-workspace/

ENTRYPOINT [ "/sbin/tini", "-g", "--" ]
CMD [ "httpd", "-f", "-h", "/minidisc-workspace", "-p", "8080" ]

EXPOSE 8080
