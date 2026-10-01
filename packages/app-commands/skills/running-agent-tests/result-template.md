# <test-name> — pass | fail | blocked

- Build: <branch> @ <short sha>, <device name> (<OS version>)
- Duration: <m:ss>, reset included
- Recording: demo.mp4

| #   | Step                             | How                                   | Result | Evidence      |
| --- | -------------------------------- | ------------------------------------- | ------ | ------------- |
| 1   | <the step, as the test words it> | `<command>` or agent-device: <action> | pass   | demo.mp4 0:04 |
| 2   | …                                | …                                     | fail   | 02-canvas.png |
| E   | Expected result                  | `<read command>`                      | pass   |               |

## Notes

What failed or blocked, what was on screen or in state instead, and anything slow,
flaky, or new for the app's known behavior.
