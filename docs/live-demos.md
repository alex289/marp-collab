# Live demos

Start a live demo from the presenter view with the **Live demo** button or <kbd>L</kbd>. The presentation keeps running in the background: slide, timer and audience windows stay where they are. Audience windows show a "Live demo" screen and leave fullscreen so the demo app can use the screen. Browsers only allow fullscreen after a click, so the audience window asks for one click when the demo ends.

In Chrome and Edge, a small always-on-top window shows the demo timer, the slide's speaker notes, and buttons to return to the presentation or continue with the next slide. Closing that window ends the demo too. Other browsers keep the demo state; press <kbd>L</kbd> again in the presenter view to return.

Mark slides that lead into a demo so the presenter view points them out and the audience sees the title:

```markdown
<!-- demo: Show the login flow -->
<!-- Log in as the test user, then open the admin panel -->
```

`<!-- demo -->` without a title works as well. Other comments on the slide remain speaker notes.
