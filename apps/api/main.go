package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var db *pgxpool.Pool

type invite struct {
	ID      int64
	EventID string
}

func main() {
	var err error
	db, err = pgxpool.New(context.Background(), env("DATABASE_URL", "postgres://site:site@localhost:5432/site?sslmode=disable"))
	if err != nil {
		panic(err)
	}
	defer db.Close()

	r := gin.Default()
	r.Use(cors())

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	r.GET("/events/:eventID/rsvp/me", getRSVP)
	r.PUT("/events/:eventID/rsvp/me", putRSVP)
	r.GET("/events/:eventID/rsvps", listRSVPs)
	r.POST("/admin/events/:eventID/invites", createInvite)

	if err := r.Run(":" + env("PORT", "8080")); err != nil {
		panic(err)
	}
}

func getRSVP(c *gin.Context) {
	inv, ok := validateInvite(c)
	if !ok {
		return
	}

	var rsvp struct {
		Email      string    `json:"email"`
		FirstName  string    `json:"firstName"`
		LastName   string    `json:"lastName"`
		Attendance string    `json:"attendance"`
		UpdatedAt  time.Time `json:"updatedAt"`
	}

	err := db.QueryRow(
		c.Request.Context(),
		`SELECT email, first_name, last_name, attendance, updated_at
		 FROM event_rsvps
		 WHERE invite_id = $1`,
		inv.ID,
	).Scan(&rsvp.Email, &rsvp.FirstName, &rsvp.LastName, &rsvp.Attendance, &rsvp.UpdatedAt)
	if err == pgx.ErrNoRows {
		c.JSON(http.StatusOK, gin.H{"eventID": c.Param("eventID"), "valid": true, "rsvp": nil})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "load failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"eventID": c.Param("eventID"), "valid": true, "rsvp": rsvp})
}

func putRSVP(c *gin.Context) {
	inv, ok := validateInvite(c)
	if !ok {
		return
	}

	var input struct {
		Email      string `json:"email"`
		FirstName  string `json:"firstName"`
		LastName   string `json:"lastName"`
		Attendance string `json:"attendance"`
	}
	if err := c.BindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json"})
		return
	}

	input.Email = strings.TrimSpace(input.Email)
	input.FirstName = strings.TrimSpace(input.FirstName)
	input.LastName = strings.TrimSpace(input.LastName)

	if input.Email == "" || input.FirstName == "" || input.LastName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing fields"})
		return
	}
	if input.Attendance != "yes" && input.Attendance != "no" && input.Attendance != "maybe" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attendance"})
		return
	}

	_, err := db.Exec(
		c.Request.Context(),
		`INSERT INTO event_rsvps
		 (invite_id, event_id, email, first_name, last_name, attendance)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (invite_id) DO UPDATE SET
		   email = EXCLUDED.email,
		   first_name = EXCLUDED.first_name,
		   last_name = EXCLUDED.last_name,
		   attendance = EXCLUDED.attendance,
		   updated_at = now()`,
		inv.ID,
		inv.EventID,
		input.Email,
		input.FirstName,
		input.LastName,
		input.Attendance,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "save failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func listRSVPs(c *gin.Context) {
	if _, ok := validateInvite(c); !ok {
		return
	}

	rows, err := db.Query(
		c.Request.Context(),
		`SELECT first_name, last_name, attendance
		 FROM event_rsvps
		 WHERE event_id = $1
		 ORDER BY lower(first_name), lower(last_name)`,
		c.Param("eventID"),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "load failed"})
		return
	}
	defer rows.Close()

	rsvps := []gin.H{}
	for rows.Next() {
		var firstName string
		var lastName string
		var attendance string
		if err := rows.Scan(&firstName, &lastName, &attendance); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "load failed"})
			return
		}

		rsvps = append(rsvps, gin.H{
			"firstName":  firstName,
			"lastName":   lastName,
			"attendance": attendance,
		})
	}
	if rows.Err() != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "load failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"eventID": c.Param("eventID"), "rsvps": rsvps})
}

func createInvite(c *gin.Context) {
	if c.GetHeader("Authorization") != "Bearer "+os.Getenv("ADMIN_TOKEN") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	eventID := c.Param("eventID")
	token := randomToken()

	_, err := db.Exec(
		c.Request.Context(),
		`INSERT INTO event_invites (event_id, token_hash)
		 VALUES ($1, $2)`,
		eventID,
		hashToken(token),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create invite failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"url":   strings.TrimRight(env("PUBLIC_APP_BASE_URL", "http://localhost:4321/events"), "/") + "/" + eventID + "#rsvp=" + token,
	})
}

func validateInvite(c *gin.Context) (invite, bool) {
	eventID := c.Param("eventID")
	token := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
		return invite{}, false
	}

	var inv invite
	var disabledAt *time.Time
	var expiresAt *time.Time
	err := db.QueryRow(
		c.Request.Context(),
		`SELECT id, event_id, disabled_at, expires_at
		 FROM event_invites
		 WHERE token_hash = $1`,
		hashToken(token),
	).Scan(&inv.ID, &inv.EventID, &disabledAt, &expiresAt)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return invite{}, false
	}

	if inv.EventID != eventID || disabledAt != nil || (expiresAt != nil && time.Now().After(*expiresAt)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "invite not allowed"})
		return invite{}, false
	}

	return inv, true
}

func randomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashToken(token string) string {
	mac := hmac.New(sha256.New, []byte(env("RSVP_TOKEN_PEPPER", "dev-pepper-change-me")))
	mac.Write([]byte(token))
	return hex.EncodeToString(mac.Sum(nil))
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func cors() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin == "http://localhost:4321" ||
			origin == "https://events.nikokomninos.com" ||
			origin == "https://nikokomninos.com" ||
			origin == "https://api.nikokomninos.com" {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
			c.Header("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")
		}

		if c.Request.Method == http.MethodOptions {
			c.Status(http.StatusNoContent)
			c.Abort()
			return
		}

		c.Next()
	}
}
