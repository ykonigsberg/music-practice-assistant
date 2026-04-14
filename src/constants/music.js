export const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const MODES = {
  "Ionian (Major)": [0, 2, 4, 5, 7, 9, 11, 12],
  "Dorian": [0, 2, 3, 5, 7, 9, 10, 12],
  "Phrygian": [0, 1, 3, 5, 7, 8, 10, 12],
  "Lydian": [0, 2, 4, 6, 7, 9, 11, 12],
  "Mixolydian": [0, 2, 4, 5, 7, 9, 10, 12],
  "Aeolian (Minor)": [0, 2, 3, 5, 7, 8, 10, 12],
  "Locrian": [0, 1, 3, 5, 6, 8, 10, 12]
};

// Standard Guitar Tuning Indices in NOTES array (High E down to Low E)
export const STRING_TUNING = [4, 11, 7, 2, 9, 4]; // E, B, G, D, A, E

export const getSections = (lang) => {
  if (lang === 'en') {
    return [
      { id: 'triads', title: 'Open Triads', duration: 20, metrics: ['Space', 'Narrative'], description: 'Focus on conscious stuttering and space' },
      { id: 'drone', title: 'Drone & Ear Training', duration: 5, metrics: ['Legato', 'Pitch Hit'], description: 'Singing numbers (1,2,3) and internal hearing' },
      { id: 'scales', title: 'Scale Note Discovery', duration: 12, metrics: ['Note Detect', 'Phrasing'], description: 'Describing the note and making it the core of the phrase' },
      { id: 'mapping', title: 'Big Time Mapping', duration: 8, metrics: ['Pulse', 'Precision'], description: 'Precision on 1, 2, 3, 4' },
    ];
  }
  return [
    { id: 'triads', title: 'טרייאדים פתוחים', duration: 20, metrics: ['Space', 'Narrative'], description: 'דגש על גמגום מודע וספייס' },
    { id: 'drone', title: 'דרון ופיתוח שמיעה', duration: 5, metrics: ['Legato', 'Pitch Hit'], description: 'שירת מספרים (1,2,3) ושמיעה פנימית' },
    { id: 'scales', title: 'גילוי צלילים בסולם', duration: 12, metrics: ['Note Detect', 'Phrasing'], description: 'תיאור הצליל והפיכתו לעיקר בפרזה' },
    { id: 'mapping', title: 'מיפוי Big Time', duration: 8, metrics: ['Pulse', 'Precision'], description: 'דיוק ב-1, 2, 3, 4' },
  ];
};
