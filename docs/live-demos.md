# Live demos

With the audience window open, press **Live demo** or <kbd>L</kbd> in the presenter view. Choose the demo tab or app window in your browser’s sharing picker. Choose the tab for browser demos to keep your speaker notes private. You can work on your own screen while the audience sees the demo in the same window as the slides. If the audience window is fullscreen, it stays fullscreen throughout. Press <kbd>B</kbd> to blank or resume the audience screen while sharing.

To open an audience window from the presenter view, choose **Open clean screen**. Press <kbd>F</kbd> or click **Toggle fullscreen** in the presenter view to toggle the audience window. With no audience window open, this toggles the presenter view itself. If the browser requires a gesture in the audience window, click its fullscreen prompt or press <kbd>F</kbd> there. Press <kbd>F</kbd> again in the presenter view to dismiss the prompt.

Use the browser’s **Stop sharing** control or press <kbd>L</kbd> again in the presenter view or its audience window to return to the current slide. For title-only demos, <kbd>L</kbd> and <kbd>F</kbd> also work from the floating controls. Closing the shared tab or window returns to the slides when the browser ends the capture. Closing or reloading the last linked audience window ends the share as well. The presentation timer keeps running throughout.

The demo video is shown without audio in audience windows opened from this presenter window. Other viewers see the “Live demo” title. If there is no local audience window or the browser lacks screen sharing, **Live demo** shows the title in the audience view. For demos that show only the title, browsers with Picture-in-Picture support offer floating controls with the demo timer, speaker notes, and buttons to return to the current or next slide.

Mark slides that lead into a demo so the presenter view points them out and the audience sees the title:

```markdown
<!-- demo: Show the login flow -->
<!-- Log in as the test user, then open the admin panel -->
```

`<!-- demo -->` without a title works as well. Other comments on the slide remain speaker notes.
