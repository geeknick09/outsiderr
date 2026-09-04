# Outsiderr — Product Vision & Product Constitution

> **Status:** Living product vision  
> **Purpose:** This document is the north star for every human and AI contributor working on Outsiderr.  
> **Rule:** When making product, UX, architecture, or feature decisions, preserve this vision unless the founder explicitly changes it.

---

## 1. What Is Outsiderr?

**Outsiderr is a community platform for underground culture.**

It is being built around **hip-hop, street culture, and extreme/street sports** — the people, crews, places, sessions, battles, experiences, and content that exist outside mainstream culture.

### Core positioning

> **Outsiderr is where the underground comes alive.**

Alternative brand language:

- **Find your scene. Find your people. Get outside.**
- **The internet for the streets.**

Outsiderr is **NOT** intended to become another generic event discovery or ticket-booking application.

---

## 2. The Problem We Are Solving

Mainstream event platforms are primarily optimized around:

> Event → Discover → Buy Ticket → Attend

Outsiderr should be optimized around:

> **Culture → People → Places → Community → Experiences → Participation**

An event is only one piece of the ecosystem.

The user should be able to discover a scene even when there is no ticket to buy.

For example, a user might open Outsiderr to:

- Discover an underground rap cypher happening tonight
- Find a skate session nearby
- Discover a new BMX crew
- Find a local graffiti spot
- Watch a clip from last night's battle
- Follow an artist or rider
- Join a crew
- Find a new underground venue
- Participate in a challenge
- RSVP to a session
- Enter a battle
- Discover people with similar interests
- See what is happening in their city

**The goal is participation and belonging, not simply transactions.**

---

# 3. What Outsiderr Must NOT Become

This is one of the most important sections of this document.

## We do NOT want to build:

### ❌ A generic ticket marketplace

We do not want the primary user journey to be:

`Browse events → Select event → Buy ticket`

### ❌ Another District / BookMyShow / SortMyScene clone

We can support ticketing, but ticketing is a **feature**, not the product identity.

### ❌ Instagram for underground culture

We do not need generic social posting.

Content should be connected to the culture and activities Outsiderr represents.

### ❌ A generic social network

Following, likes, comments, and profiles should support participation in the scene rather than become the entire product.

### ❌ A generic event CMS

Events should connect to people, crews, places, culture, content, and participation.

---

# 4. The Outsiderr Product Model

The product should be thought of as five interconnected layers:

```text
                         OUTSIDERR
                             |
          +------------------+------------------+
          |                  |                  |
       CULTURE             PEOPLE            PLACES
          |                  |                  |
      Hip-Hop             Artists           Venues
      Rap                 DJs               Skate Spots
      Breaking            Riders            Parks
      Graffiti            Skaters           Studios
      DJing               Crews              Underground Spaces
          |                  |                  |
          +------------------+------------------+
                             |
                       EXPERIENCES
                             |
              +--------------+--------------+
              |              |              |
            Events         Sessions        Battles
            Cyphers        Jams            Challenges
            Competitions   Meetups         Workshops
                             |
                             |
                          CONTENT
                             |
                 Videos / Photos / Clips
                             |
                             |
                         COMMUNITY
                             |
             Followers / Crews / Participants
```

Tickets sit **inside the experience layer**.

They should never dominate the entire product.

---

# 5. The Scene Graph — Our Potential Moat

One of the most important long-term concepts for Outsiderr is the **Scene Graph**.

Every important object in Outsiderr should be capable of connecting to other objects.

For example:

```text
BLOCK CYPHER
     |
     +-- People
     |     +-- Rappers
     |     +-- DJs
     |     +-- Breakers
     |     +-- Organizers
     |
     +-- Crew
     |
     +-- Location
     |
     +-- Venue
     |
     +-- Culture
     |
     +-- Battles
     |
     +-- Participants
     |
     +-- Photos
     |
     +-- Videos
     |
     +-- Clips
     |
     +-- Results
     |
     +-- Future Events
```

The same model applies to street sports:

```text
SKATE SESSION
     |
     +-- Riders
     +-- Crew
     +-- Skate Spot
     +-- Videos
     +-- Tricks
     +-- Challenges
     +-- Upcoming Sessions
```

This means Outsiderr is not merely storing events.

It is building a **living map of underground culture**.

---

# 6. Core Cultural Categories

The initial focus should remain intentionally narrow.

## Phase 1 — Street Culture

### Hip-Hop

- Rap
- Freestyle
- DJing
- Breaking
- Beatboxing
- Graffiti
- Beat battles
- Rap battles

### Street / Extreme Sports

- Skateboarding
- BMX
- Parkour
- Freerunning
- Roller / inline
- Street basketball

The shared theme is not simply the activity.

The shared theme is:

> **People creating culture, identity, and community outside the mainstream.**

Future categories can be introduced only after the initial community has meaningful density.

---

# 7. Core Product Objects

Outsiderr should eventually revolve around these objects:

## 7.1 People

Examples:

- Artist
- Rapper
- DJ
- Breaker
- Skater
- BMX rider
- Parkour athlete
- Photographer
- Videographer
- Organizer

People should build reputation through **participation**, not just follower count.

---

## 7.2 Crews

Crews are extremely important to underground culture.

A crew can represent:

- Hip-hop collective
- Skate crew
- BMX crew
- Parkour group
- Event collective
- Creative collective

A crew should be able to:

- Build a profile
- Add members
- Organize experiences
- Publish content
- Build a history
- Grow its local community

Eventually Outsiderr can support:

> Crew vs Crew

and crew-based experiences.

---

## 7.3 Places

Places are not just venues.

They can be:

- Concert venues
- Underground spaces
- Skate spots
- BMX spots
- Parks
- Studios
- Graffiti walls
- Practice spaces
- Community gathering points

A place can have:

- Sessions
- Events
- People
- Crews
- Photos
- Videos
- Activity history

This makes the map a living representation of the scene.

---

## 7.4 Experiences

An experience can be:

- Event
- Cypher
- Battle
- Jam
- Session
- Competition
- Workshop
- Meetup
- Challenge
- Open mic
- Concert
- Pop-up

The word **Experience** is intentionally broader than Event.

---

# 10. Content Philosophy

Outsiderr should have a culture feed, but it should NOT become a generic social feed.

Content should answer:

> **What is happening in the scene?**

Examples:

- Someone just landed a new trick
- A rapper won a battle
- A new skate spot was discovered
- A crew hosted a jam
- A cypher happened last night
- A new underground artist was discovered
- A local event is starting soon
- A rider uploaded a new clip

Content should be strongly connected to:

- People
- Places
- Crews
- Experiences
- Culture

---

# 11. Reputation — The Outsider Identity

Outsiderr should eventually reward participation.

Instead of making follower count the primary reputation mechanism, consider an **Outsider Score / Level / Reputation** system.

Example:

```text
@RDX

OUTSIDER LEVEL 27

Cyphers       14
Battles        9
Sessions      31
Events        17
Challenges     6
Clips         42
```

Possible achievements:

- Cypher Winner
- Battle Veteran
- Street Regular
- 10 Battles
- Crew Leader
- Local OG
- Session Streak

The objective is to recognize:

> **Participation, contribution, consistency, and reputation within the scene.**

---

# 12. Home Screen Philosophy

The home screen should NOT primarily say:

> Upcoming Events

Instead it should feel like entering the local underground scene.

Example:

```text
OUTSIDERR

Find your scene.

--------------------------------

🔥 HAPPENING NOW

Block Cypher
Kolkata · 2.4 km

🎤 Hip-Hop
👥 82 Outsiders

[ JOIN ]

--------------------------------

👀 YOUR SCENE

Because you follow:
Hip-Hop · Skate · BMX

--------------------------------

🎥 FROM THE STREETS

[ Clip ] [ Clip ] [ Clip ]

--------------------------------

📍 AROUND YOU

3 sessions happening nearby

--------------------------------

⚔️ BATTLES

Rap Battle — 8 spots left
Skate Best Trick — Sunday

--------------------------------

👥 YOUR CREW

12 people are going to Block Cypher
```

This should feel like a **scene discovery product**, not an event catalog.

---

# 13. Ticketing Philosophy

Outsiderr can and should support ticketing when required.

But:

> **Tickets are infrastructure, not identity.**

A user might:

1. Discover a crew
2. Watch a clip
3. Discover an artist
4. Find an upcoming cypher
5. RSVP
6. Buy a ticket if required
7. Attend
8. Upload a clip
9. Follow new people
10. Join the next experience

The ticket transaction is only one step in the journey.

---

# 14. Organizer Model

Do not treat every organizer as a generic event organizer.

Potential identities:

### CREW

Runs underground experiences.

### ARTIST

Performs or competes.

### ATHLETE

Participates in sports experiences.

### VENUE

Hosts experiences.

### COMMUNITY

Creates gatherings.

### BRAND

Sponsors or partners with the scene.

Different identities can eventually have different capabilities.

---

# 15. Outsiderr Originals

Long term, Outsiderr should not only document the underground.

**Outsiderr should create culture.**

Examples:

## OUTSIDERR ORIGINALS

### BLOCK CYPHER

Rap × DJ × Breaking × Graffiti

### OUTSIDERR STREET JAM

Skate × BMX × Parkour × Music

### OUTSIDERR NIGHT RIDE

BMX × Skate × DJ

### OUTSIDERR BATTLE

Rap × Dance × Skate

This is the path from:

> Platform for the scene

to:

> **Brand that shapes the scene.**

---

# 16. Business Model Philosophy

The business should not depend exclusively on ticket commission.

Potential revenue streams:

```text
                         OUTSIDERR
                             |
        +--------------------+--------------------+
        |                    |                    |
     Tickets              Sponsors             Brands
        |                    |                    |
    Events              Campaigns              Drops
        |                    |                    |
        +--------------------+--------------------+
                             |
                     OUTSIDERR ORIGINALS
                             |
                     Premium Organizer Tools
                             |
                      Merchandise / Drops
```

Potential future monetization:

- Ticketing fees
- Event promotion
- Organizer SaaS/tools
- Brand sponsorships
- Brand activations
- Merchandise
- Limited drops
- Crew subscriptions/features
- Outsiderr Originals
- Premium experiences

---

# 17. Product Principles for AI Developers

Every AI agent or developer working on Outsiderr should follow these principles.

## Principle 1 — Culture before commerce

Ask:

> Does this help people participate in or discover the scene?

before asking:

> Can we monetize this?

---

## Principle 2 — Community before transactions

A ticket purchase is useful.

A person joining a crew and returning every week is more valuable.

Optimize for **retention and participation**, not only conversion.

---

## Principle 3 — Identity matters

People should feel like they have an identity within Outsiderr.

Artists, riders, crews, organizers and participants should have meaningful profiles and history.

---

## Principle 4 — Everything should connect

Where possible:

```text
People ↔ Crews ↔ Places ↔ Experiences ↔ Content
```

Avoid isolated entities.

---

## Principle 5 — The physical world matters

Outsiderr is fundamentally about getting people **outside**.

The app should drive real-world participation:

- Go to a session
- Join a cypher
- Meet a crew
- Visit a spot
- Attend a battle
- Participate in a challenge

---

## Principle 6 — Authenticity over scale

Do not add mainstream categories simply because they increase the theoretical market size.

A smaller authentic community is more valuable than a large generic event catalog.

---

## Principle 7 — Don't copy mainstream event apps

If a proposed feature makes Outsiderr look more like a generic ticketing platform, question it.

---

# 18. MVP Direction

The first version does NOT need to build the entire vision.

The MVP should establish the core loop:

```text
DISCOVER
   ↓
PEOPLE / CREWS / PLACES / EXPERIENCES
   ↓
JOIN / RSVP / PARTICIPATE
   ↓
ATTEND
   ↓
CONTENT
   ↓
FOLLOW / CONNECT
   ↓
RETURN
```

A practical MVP can focus on:

### Discovery

- Nearby experiences
- Culture/category filters
- Map
- Experience detail

### Community

- User profiles
- Crew profiles
- Follow
- Participation history

### Experiences

- Events
- Cyphers
- Sessions
- Battles
- RSVP
- Ticketing where necessary

### Content

- Photos
- Short videos/clips
- Experience-linked content

Do not attempt to build every future capability at launch.

---

# 19. Future Product Direction

Once the core community has density, expand toward:

### Phase 2

- Crews
- Reputation
- Challenges
- Scene map
- Better content
- Battle mechanics
- Organizer tools

### Phase 3

- Outsiderr Originals
- Brand partnerships
- Sponsorship marketplace
- Merchandise
- Advanced reputation
- City-wide scene discovery
- Cross-city communities

### Long term

Outsiderr becomes:

> **The operating system for underground culture.**

A place where:

- People discover scenes
- Artists build reputation
- Crews organize
- Venues host
- Communities grow
- Brands participate
- Experiences happen
- Culture gets documented

---

# 20. The North Star

Whenever a product decision is unclear, ask these questions:

### 1. Does this strengthen the underground community?

### 2. Does this connect people, places, culture, experiences, or content?

### 3. Does this encourage real-world participation?

### 4. Does this make Outsiderr feel different from a ticket-booking app?

### 5. Does this strengthen identity or reputation?

### 6. Does this help us build a living scene graph?

### 7. Would an underground artist, rider, crew, or fan genuinely care about this?

If the answer to most of these is **no**, the feature probably does not belong in Outsiderr.

---

# 21. One Sentence Every AI Developer Should Remember

> **Outsiderr is NOT an app where people buy tickets to events. Outsiderr is the digital layer around underground culture — connecting people, crews, places, experiences and content, and ultimately becoming the place where that culture discovers itself, meets, participates and grows.**

---

## Final Product Identity

```text
                      OUTSIDERR

                 FIND YOUR SCENE.
                 FIND YOUR PEOPLE.
                    GET OUTSIDE.

              HIP-HOP × STREET CULTURE
                    × EXTREME SPORTS

                    PEOPLE
                       ↕
                     CREWS
                       ↕
                    PLACES
                       ↕
                 EXPERIENCES
                       ↕
                    CONTENT
                       ↕
                  COMMUNITY

                "Where the
             underground comes alive."
```

**This document is a product north star.**

Individual features, UI decisions, technical architecture, database models, APIs, and implementation details may evolve.

**The vision should not drift accidentally.**
