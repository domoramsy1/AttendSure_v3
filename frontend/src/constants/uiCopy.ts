export const UI_TEXT = {
  auth: {
    systemName: "AttendSure",
    tagline: "School Attendance & Gate System",
    loginHeader: "Faculty Sign In",
    loginSubtext: "Sign in using your DepEd username or Employee ID",
    inputIdentifier: "Username or Employee ID",
    inputPassword: "Password",
    submitButton: "Sign In",
    footerText: "AttendSure • Simple School Attendance & Campus Safety",
  },
  header: {
    gateOnline: "Gate Scanner: Online",
    gateOffline: "Gate Scanner: Offline",
  },
  dashboard: {
    telemetryWaiting: "Waiting for Gate Taps",
    telemetryActive: "Gate Active & Logging",
    mainTitle: "Today's Attendance Overview",
    mainSubtitle: "Live gate taps, classroom attendance, and faculty time cards.",
    
    // 4 Stat Cards
    cards: {
      presentLearners: {
        title: "STUDENTS IN SCHOOL",
        waitingSubtext: "Waiting for students to tap in at the gate",
      },
      unexcusedAbsences: {
        title: "ABSENT STUDENTS",
        idleSubtext: "No absence alerts sent yet",
      },
      gateThroughput: {
        title: "TOTAL GATE SCANS",
        unit: "scans today",
        readersOnline: "Gate Readers Online",
        readersOffline: "Gate Readers Offline",
        subtext: "Card taps and backup QR scans",
      },
      facultyDtr: {
        title: "TEACHER DTR (FORM 48)",
        badge: "Form 48",
        waitingSubtext: "No facultys checked in yet",
      },
    },

    // Bottom Panels
    influxPanel: {
      title: "Arrivals by Hour",
      subtitle: "Number of students and faculty entering campus each hour",
      legend: "Total Taps",
      emptyTitle: "No Gate Check-ins Yet Today",
      emptyDescription: "Numbers will update as soon as students tap their ID cards at the gate.",
    },
    sectionPanel: {
      title: "Class Attendance",
      subtitle: "Based on faculty classroom scans today",
      tabAll: "All Classes",
      tabTop: "Highest",
      emptyTitle: "No Class Attendance Yet",
      emptyDescription: "Class attendance will show here once facultys scan their students.",
    },
  },
  sidebar: {
    dashboard: "Dashboard",
    students: "Students",
    facultys: "Facultys",
    users: "User Accounts",
    gatePasses: "Pass Slips",
    schedules: "Classes & Sections",
    dtr: "Faculty DTR (Form 48)",
    geofence: "Campus Boundary",
    scanners: "Gate Scanners",
    reports: "DepEd Reports (SF1, SF2)",
  },
} as const;