FROM golang:1.22-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/sev1 .

FROM alpine:3.20

WORKDIR /app

COPY --from=build /out/sev1 /app/sev1
COPY --from=build /src/content /app/content

EXPOSE 8081

CMD ["/app/sev1", "-addr", ":8081", "-content", "/app/content"]
