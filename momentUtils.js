const moment = require('moment-business-time');

module.exports = function () {
    moment.updateLocale('en', {
        workinghours: {
            0: null,
            1: ['04:00:00', '19:00:00'],
            2: ['04:00:00', '19:00:00'],
            3: ['04:00:00', '19:00:00'],
            4: ['04:00:00', '19:00:00'],
            5: ['04:00:00', '19:00:00'],
            6: null
        }
    });

    function diffInMinutes(laterDateTime, earlierDateTime, isWorkingDiff) {
        const unit = "minutes";
        if (laterDateTime == null || earlierDateTime == null) {
            return null;
        }
        const laterMoment = moment(laterDateTime);
        const earlierMoment = moment(earlierDateTime);
        if (laterMoment.isBefore(earlierMoment, unit)) {
            return null;
        }
    
        return isWorkingDiff ? laterMoment.workingDiff(earlierMoment, unit, true) : laterMoment.diff(earlierMoment, unit, true);
    }

    function momentSort(a, b) {
        return moment(a).toDate().getTime() - moment(b).toDate().getTime();
    }
    

    return {
        diffInMinutes: diffInMinutes,
        momentSort: momentSort
    }
};