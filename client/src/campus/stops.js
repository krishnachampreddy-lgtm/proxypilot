// Guided tour stops (camera position, what it looks at, and the caption)
export const STOPS = [
  { title: 'Main gate', time: '7:40 am', text: 'A teacher wakes up unwell. One tap on “I’m sick today” — before she even leaves home.', cam: [4, 4.4, 57], target: [0, 4.8, 30], beacon: [0, 0.1, 44] },
  { title: 'Staff room', time: '7:41 am', text: 'Her leave reaches the HOD instantly. No phone calls, no WhatsApp chains.', cam: [-12, 3.4, 9], target: [-29, 2, -4], beacon: [-27.8, 0.45, -3] },
  { title: 'HOD office', time: '7:45 am', text: 'One tap to approve — or decline with a reason the teacher can see.', cam: [12, 7.4, 3], target: [29, 5.4, -10], beacon: [27.8, 4.05, -10] },
  { title: 'Classrooms', time: '7:46 am', text: 'Each missed class goes to the fairest free teacher of the same subject. Other subjects step in as backup.', cam: [17, 8.6, -13], target: [11.4, 8.9, -27.4], beacon: [11.6, 7.65, -26], story: true },
  { title: 'Library', time: '7:52 am', text: 'The substitute gets the request in the app, with a handover note on what to teach.', cam: [-57, 5.5, -21], target: [-64, 3, -42], beacon: [-64, 0.5, -36] },
  { title: 'Playground', time: '8:50 am', text: 'Students see who is taking their class before the bell rings.', cam: [56, 22, 28], target: [85, 0, -28], beacon: [85, 0.1, -30] },
  { title: 'Bus bay', time: '4:20 pm', text: 'By evening every class was covered — and the HOD has the full record for the month.', cam: [56, 9, 52], target: [30, 1.5, 30], beacon: [30, 0.1, 30] },
];

