# Trial brief: the scripted owner

For a trial run of `/bootstrap` (`SKILL.md`, _Trial runs_). An agent plays
the owner and answers each question from this file only. Everything here is
invented: the product, the brand, the people, the domain and every address.
No account below exists, and none may be created for a trial. A question
this file does not answer gets "you choose".

The owner is **Maren Holt**, who teaches piano and runs a small studio. She
answers briefly, in plain words, and approves recommendations unless this
file says otherwise.

## 1-basics

- **Display name:** Quillmoor
- **Slug:** `quillmoor`
- **What it is:** "Quillmoor lets independent music teachers take lesson
  bookings from a page of their own, without the back-and-forth of
  messages."
- **Domain:** `quillmoor.example`, not registered yet: treat it as planned.
- **Language and direction:** English, left to right.
- **Market:** the United Kingdom and Ireland.
- **AWS region:** `eu-west-2` (London).
- **Data rule:** UK GDPR. Students' names and contact details stay in the
  UK region; "I promised my students that."

## 2-product-brief

- **The problem:** independent teachers book lessons by text and email;
  students ask "are you free Thursday?", the teacher scrolls a paper diary,
  and slots get double-booked or lost.
- **The people:**
  - *the teacher*, who owns the studio: at a desk on Sunday evening setting
    the week, on a phone between lessons; worries about double bookings and
    looking unprofessional;
  - *the student or parent*, who books: on a phone, often late in the
    evening; worries about whether the booking really went through and what
    happens if they must cancel.
- **First flows, ranked:**
  1. the teacher sets their weekly hours and lesson lengths;
  2. a student books a free slot from the teacher's public page, and both
     get a confirmation;
  3. the teacher sees the week's lessons at a glance.
  Not in this version: payments, group lessons, reminders by text message.
- **Words:** *studio* (one teacher's practice), *slot* (a time a lesson can
  start), *lesson* (a booked slot), *booking page* (the studio's public page).
  Never "user" or "appointment" in the product's text.
- **How it charges:** per studio, monthly; free for studios with up to five
  students. The billing unit is the **studio**.
- **Review sites:** "I don't know any." Competitors: Metronome Booking
  (`metronomebooking.example`), a general booking tool teachers complain is
  built for hairdressers.

## 3-owner-setup

- **GitHub repository:** none for the trial. Skip creating one and skip the
  branch rule; together they become the trial's one inbox item, saying so.
- **The project's own account:** `studio-ops@quillmoor.example`.
- **Exception to it:** none.
- **Publish the inbox page:** yes. It is the trial's only outward action.

## 4-design-system

- **Feel:** warm, unhurried, dependable. Never corporate, never loud.
- **References:** a printed concert programme (calm type, lots of space); a
  well-kept paper diary (lines, clear days).
- **Colour:** mostly warm greys and paper white, one accent: a deep teal.
  "Colour only where I should press or look."
- **Type:** Source Sans 3 (`@fontsource-variable/source-sans-3`), for its
  friendly figures in times and dates.
- **Shape:** slightly round; buttons and fields round, the day grid square.
- **Voice:** a teacher talking to a student: "you", informal, short
  sentences, warm but not chummy. Never "seamless", "leverage" or "user".

## 5-scaffold

- **Component library:** Radix, as recommended.
- **Style:** `new-york`.
- **Registry:** keep the default registry.
- **Logo:** none yet; a lettermark "Q" in the accent.

## 6-replace-skeleton

- **First feature:** the student books a slot (flow 2), once its spec,
  design and plan exist; the trial does not reach this step.
- **Mail:** yes, the booking confirmation is an email to both.

## 7-accounts

- **Defer it:** "Not now; I'll set up hosting when the first feature works."
  If asked anyway: one account, a monthly budget alert at 20 USD to
  `maren+aws@quillmoor.example`, Identity Center user name `maren`.
