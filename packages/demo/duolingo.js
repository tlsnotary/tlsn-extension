const config = {
    name: 'Duolingo Plugin',
    description: 'This plugin will prove your email and current streak on Duolingo.',
};

const api = 'www.duolingo.com';
const ui = 'https://www.duolingo.com/';

function getRelevantHeaderValues() {
    const [header] = useHeaders(headers => {
        return headers.filter(header => header.url.includes(`https://${api}/2023-05-23/users`));
    });

    const authorization = header?.requestHeaders.find(header => header.name === 'Authorization')?.value;

    const traceId = header?.requestHeaders.find(header => header.name === 'X-Amzn-Trace-Id')?.value;
    const user_id = traceId?.split('=')[1];

    return { authorization, user_id };
}

async function onClick() {
    const isRequestPending = useState('isRequestPending', false);

    if (isRequestPending) return;

    setState('isRequestPending', true);

    const { authorization, user_id } = getRelevantHeaderValues();

    const headers = {
        authorization: authorization,
        Host: api,
        'Accept-Encoding': 'identity',
        Connection: 'close',
    };

    const resp = await prove(
        {
            // Fields available:
            // acquisitionSurveyReason,adsConfig,animationEnabled,betaStatus,blockedUserIds,blockerUserIds,
            // canUseModerationTools,classroomLeaderboardsEnabled,courses,creationDate,currentCourseId,
            // email,emailAnnouncement,emailAssignment,emailAssignmentComplete,emailClassroomJoin,
            // emailClassroomLeave,emailEditSuggested,emailEventsDigest,emailFollow,emailPass,
            // emailPromotion,emailResearch,emailWeeklyProgressReport,emailSchoolsAnnouncement,
            // emailSchoolsNewsletter,emailSchoolsProductUpdate,emailSchoolsPromotion,emailStreamPost,
            // emailVerified,emailWeeklyReport,enableMicrophone,enableSoundEffects,enableSpeaker,
            // experiments%7Bmath_on_web,math_on_web_dogfooding,path_web_course_complete_slides,
            // path_web_sections_overview,placeholder_experiment,spack_new_years_2026_clarifying_copy,
            // spack_new_years_2026_discount,spack_new_years_2026_family_package,
            // spack_new_years_2026_seconds_timer,web_bingo_ja_xx,web_bingo_ko_xx,web_bingo_zh_xx%7D,
            // facebookId,fromLanguage,gemsConfig,globalAmbassadorStatus,googleId,hasFacebookId,
            // hasGoogleId,hasPlus,health,id,inviteURL,joinedClassroomIds,lastResurrectionTimestamp,
            // learningLanguage,location,name,observedClassroomIds,optionalFeatures,
            // persistentNotifications,picture,plusDiscounts,practiceReminderSettings,privacySettings,
            // referralInfo,rewardBundles,roles,sessionCount,shouldPreventMonetizationForSchoolsUser,
            // streak,streakData%7BcurrentStreak,longestStreak,previousStreak%7D,timezone,
            // timezoneOffset,totalXp,trackingProperties,username,webNotificationIds,xpGains,xpGoal,zhTw

            url: `https://${api}/2023-05-23/users/${user_id}?fields=longestStreak,username`,
            method: 'GET',
            headers: headers,
        },
        {
            verifierUrl: 'http://localhost:7047',
            proxyUrl: `ws://localhost:7047/proxy?token=${api}`,
            maxRecvData: 2400,
            maxSentData: 1200,
            handlers: [
                { type: 'SENT', part: 'START_LINE', action: 'REVEAL', },
                { type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: 'longestStreak', }, },
            ]
        }
    );
    done(JSON.stringify(resp));
}

function expandUI() {
    setState('isMinimized', false);
}

function minimizeUI() {
    setState('isMinimized', true);
}

function main() {
    const { authorization, user_id } = getRelevantHeaderValues();
    const header_has_necessary_values = authorization && user_id;

    const isMinimized = useState('isMinimized', false);
    const isRequestPending = useState('isRequestPending', false);

    useEffect(() => {
        openWindow(ui);
    }, []);

    if (isMinimized) {
        return div({
            style: {
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                backgroundColor: '#58CC02',
                boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                zIndex: '999999',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                fontSize: '24px',
                color: 'white',
            },
            onclick: 'expandUI',
        }, ['🦉']);
    }

    return div({
        style: {
            position: 'fixed',
            bottom: '0',
            right: '8px',
            width: '280px',
            borderRadius: '8px 8px 0 0',
            backgroundColor: 'white',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
            zIndex: '999999',
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            overflow: 'hidden',
        },
    }, [
        div({
            style: {
                background: 'linear-gradient(135deg, #58CC02 0%, #4CAF00 100%)',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: 'white',
            }
        }, [
            div({
                style: {
                    fontWeight: '600',
                    fontSize: '16px',
                }
            }, ['Duolingo Streak']),
            button({
                style: {
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontSize: '20px',
                    cursor: 'pointer',
                    padding: '0',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                },
                onclick: 'minimizeUI',
            }, ['−'])
        ]),

        div({
            style: {
                padding: '20px',
                backgroundColor: '#f8f9fa',
            }
        }, [
            div({
                style: {
                    marginBottom: '16px',
                    padding: '12px',
                    borderRadius: '6px',
                    backgroundColor: header_has_necessary_values ? '#d4edda' : '#f8d7da',
                    color: header_has_necessary_values ? '#155724' : '#721c24',
                    border: `1px solid ${header_has_necessary_values ? '#c3e6cb' : '#f5c6cb'}`,
                    fontWeight: '500',
                },
            }, [
                header_has_necessary_values ? '✓ Api token detected' : '⚠ No API token detected'
            ]),

            // Conditional UI based on whether we have intercepted the headers
            header_has_necessary_values ? (
                // Show prove button when not pending
                button({
                    style: {
                        width: '100%',
                        padding: '12px 24px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #58CC02 0%, #4CAF00 100%)',
                        color: 'white',
                        fontWeight: '600',
                        fontSize: '15px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        opacity: isRequestPending ? 0.5 : 1,
                        cursor: isRequestPending ? 'not-allowed' : 'pointer',
                    },
                    onclick: 'onClick',
                }, [isRequestPending ? 'Generating Proof...' : 'Generate Proof'])
            ) : (
                // Show login message
                div({
                    style: {
                        textAlign: 'center',
                        color: '#666',
                        padding: '12px',
                        backgroundColor: '#fff3cd',
                        borderRadius: '6px',
                        border: '1px solid #ffeaa7',
                    }
                }, ['Please login to Duolingo to continue'])
            )
        ])
    ]);
}

export default {
    main,
    onClick,
    expandUI,
    minimizeUI,
    config,
};
