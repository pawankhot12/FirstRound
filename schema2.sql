CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT,
        college TEXT,
        targetCompany TEXT,
        targetRole TEXT,
        role TEXT,
        totalPoints INTEGER,
        totalTestsAttempted INTEGER,
        totalCorrect INTEGER,
        totalIncorrect INTEGER,
        averageAccuracy REAL,
        averageTimePerQuestionSeconds INTEGER,
        readNotificationIds TEXT,
        createdAt TEXT
      , competitiveRating INTEGER DEFAULT 0, currentLeague TEXT DEFAULT 'Bronze', targetRoleId TEXT REFERENCES roles(id))

CREATE TABLE companies (
        id TEXT PRIMARY KEY,
        name TEXT,
        badge TEXT,
        color TEXT,
        accentBg TEXT,
        description TEXT,
        rounds TEXT,
        patternSummary TEXT,
        negativeMarking TEXT,
        typicalCutoff TEXT,
        recommendedPrepTime TEXT,
        activeTestCount INTEGER
      )

CREATE TABLE tests (
        id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        category TEXT,
        company TEXT,
        companyId TEXT,
        companyName TEXT,
        roles TEXT,
        supportedRoles TEXT,
        skills TEXT,
        topics TEXT,
        difficulty TEXT,
        durationMinutes INTEGER,
        duration INTEGER,
        totalQuestions INTEGER,
        questionCount INTEGER,
        passingPercentage REAL,
        testType TEXT,
        mode TEXT,
        patternVersion TEXT,
        verificationStatus TEXT,
        isMegaEvent INTEGER,
        megaEventId TEXT,
        tags TEXT,
        attemptsCount INTEGER,
        avgScore REAL,
        status TEXT,
        scoringModel TEXT
      , deletedAt TEXT, version INTEGER NOT NULL DEFAULT 1)

CREATE TABLE questions (
        id TEXT PRIMARY KEY,
        testSeriesId TEXT,
        questionText TEXT,
        codeSnippet TEXT,
        options TEXT,
        correctOption TEXT,
        topic TEXT,
        subTopic TEXT,
        difficulty TEXT,
        companyTag TEXT,
        yearTag TEXT,
        explanation TEXT,
        shortcutFormula TEXT,
        stimulusId TEXT,
        stimulus TEXT
      )

CREATE TABLE mega_events (
        id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        company TEXT,
        startTime TEXT,
        endTime TEXT,
        durationMinutes INTEGER,
        status TEXT,
        testSeriesId TEXT,
        totalParticipants INTEGER,
        prizes TEXT,
        bannerTag TEXT,
        badge TEXT
      )

CREATE TABLE test_attempts (
        id TEXT PRIMARY KEY,
        userId TEXT,
        userName TEXT,
        userCollege TEXT,
        testSeriesId TEXT,
        testInstanceId TEXT,
        testTitle TEXT,
        companyName TEXT,
        mode TEXT,
        totalQuestions INTEGER,
        attemptedQuestions INTEGER,
        correctCount INTEGER,
        incorrectCount INTEGER,
        unattemptedCount INTEGER,
        scorePoints INTEGER,
        accuracyPercentage INTEGER,
        timeTakenSeconds INTEGER,
        avgTimePerQuestionSeconds INTEGER,
        submittedAt TEXT,
        topicBreakdown TEXT,
        strengths TEXT,
        weaknesses TEXT,
        recommendations TEXT,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )

CREATE TABLE attempt_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attemptId TEXT,
        questionId TEXT,
        selectedOption TEXT,
        timeSpentSeconds INTEGER,
        isCorrect INTEGER,
        correctOption TEXT,
        question TEXT,
        FOREIGN KEY (attemptId) REFERENCES test_attempts(id) ON DELETE CASCADE
      )

CREATE TABLE sqlite_sequence(name,seq)

CREATE TABLE bookmarks (
        id TEXT PRIMARY KEY,
        userId TEXT,
        questionId TEXT,
        question TEXT,
        addedAt TEXT,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )

CREATE TABLE notifications (
        id TEXT PRIMARY KEY,
        type TEXT,
        title TEXT,
        message TEXT,
        createdAt TEXT,
        actionType TEXT,
        actionTargetId TEXT,
        actionTestId TEXT,
        actionTab TEXT,
        actionLabel TEXT,
        actionUrl TEXT,
        targetCompany TEXT,
        targetUserId TEXT,
        audience TEXT
      )

CREATE TABLE coding_submissions (
        id TEXT PRIMARY KEY,
        userId TEXT,
        testSeriesId TEXT,
        testAttemptId TEXT,
        questionId TEXT,
        language TEXT,
        sourceCode TEXT,
        executionResult TEXT,
        isFinalSubmission INTEGER,
        createdAt TEXT,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )

CREATE TABLE test_user_history (
        userId TEXT,
        testId TEXT,
        status TEXT,
        firstVisitedAt TEXT,
        lastVisitedAt TEXT,
        lastAttemptAt TEXT,
        attemptCount INTEGER,
        bestScore REAL,
        lastScore REAL,
        PRIMARY KEY (userId, testId),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )

CREATE TABLE weekly_seasons (
        id TEXT PRIMARY KEY,
        status TEXT,
        startTime TEXT,
        endTime TEXT
      )

CREATE TABLE weekly_standings (
        userId TEXT,
        seasonId TEXT,
        league TEXT,
        score INTEGER,
        rank INTEGER,
        movement TEXT,
        PRIMARY KEY (userId, seasonId),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )

CREATE TABLE roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )

CREATE TABLE career_tracks (
        id TEXT PRIMARY KEY,
        roleId TEXT NOT NULL REFERENCES roles(id),
        title TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        version INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        publishedAt TEXT
      )

CREATE TABLE track_stages (
        id TEXT PRIMARY KEY,
        trackId TEXT NOT NULL REFERENCES career_tracks(id),
        stageOrder INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'published',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE(trackId, stageOrder)
      )

CREATE TABLE track_items (
        id TEXT PRIMARY KEY,
        stageId TEXT NOT NULL REFERENCES track_stages(id),
        testId TEXT REFERENCES tests(id),
        itemOrder INTEGER NOT NULL,
        itemType TEXT NOT NULL,
        isRequired INTEGER NOT NULL DEFAULT 1,
        completionRule TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )

CREATE TABLE assessment_roles (
        assessmentId TEXT NOT NULL REFERENCES tests(id),
        roleId TEXT NOT NULL REFERENCES roles(id),
        relevance TEXT DEFAULT 'primary',
        createdAt TEXT NOT NULL,
        PRIMARY KEY(assessmentId, roleId)
      )

CREATE TABLE assessment_companies (
        assessmentId TEXT NOT NULL REFERENCES tests(id),
        companyId TEXT NOT NULL REFERENCES companies(id),
        createdAt TEXT NOT NULL,
        PRIMARY KEY(assessmentId, companyId)
      )

CREATE TABLE track_company_milestones (
        id TEXT PRIMARY KEY,
        trackId TEXT NOT NULL REFERENCES career_tracks(id),
        assessmentId TEXT NOT NULL REFERENCES tests(id),
        stageId TEXT NOT NULL REFERENCES track_stages(id),
        unlockRule TEXT,
        status TEXT NOT NULL DEFAULT 'published',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE(trackId, assessmentId)
      )

CREATE TABLE user_track_progress (
        userId TEXT NOT NULL REFERENCES users(id),
        trackId TEXT NOT NULL REFERENCES career_tracks(id),
        currentStageId TEXT,
        status TEXT NOT NULL DEFAULT 'not_started',
        startedAt TEXT,
        completedAt TEXT,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY(userId, trackId)
      )

CREATE TABLE user_track_item_progress (
        userId TEXT NOT NULL REFERENCES users(id),
        trackItemId TEXT NOT NULL REFERENCES track_items(id),
        status TEXT NOT NULL DEFAULT 'locked',
        completedAt TEXT,
        sourceAttemptId TEXT,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY(userId, trackItemId)
      )