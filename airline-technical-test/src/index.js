import express from 'express'
import { PORT } from './config.js'
import { pool } from './connect_db.js'

const app = express()

app.get('/flights/:id/passengers', async (req, res) => {
  try {
    // Se obtiene un id de vuelo, luego se realiza una consulta a la base de datos sobre el vuelo.
    const flightId = req.params.id
    const [flight] = await pool.query(`SELECT flight_id AS flightId, takeoff_date_time AS takeoffDateTime,
                                       takeoff_airport AS takeoffAirport, landing_date_time AS landingDateTime,
                                       landing_airport AS ladingAirport, airplane_id AS airplaneId
                                       FROM flight WHERE flight_id = ${flightId};`)

    // En caso de que el vuelo no se encuentre.
    if (flight.length === 0) {
      return res.json({ code: 404, data: {} })
    }

    // Seleccionando todos los pasajeros que están en el vuelo con el id de flightId.
    const [passengers] = await pool.query(`SELECT boarding_pass.passenger_id AS passengerId, passenger.dni, passenger.name, passenger.age, passenger.country,
                                           boarding_pass_id AS boardingPassId, purchase_id AS purchaseId, seat_type_id AS seatTypeId, seat_id AS seatId
                                           FROM airline.boarding_pass, airline.passenger
                                           WHERE flight_id = ${flightId}
                                           AND passenger.passenger_id = boarding_pass.passenger_id;`)

    // Seleccionando todos los asientos que están en el avion donde airplane_id = flightId[0].airplaneId.
    const [seats] = await pool.query(`SELECT seat_id AS seatId, seat_column AS seatColumn, seat_row AS seatRow, seat_type_id AS seatTypeId
                                      FROM seat WHERE airplane_id = ${flight[0].airplaneId};`)

    const seatsBackup = []

    // Borrando los asientos ocupados.
    passengers.forEach((passenger) => {
      if (!passenger.seatId) return
      const seat = seats.find((seat) => seat.seatId === passenger.seatId)
      const seatIndex = seats.indexOf(seat)
      seatsBackup.push(seat)
      seats.splice(seatIndex, 1)
    })

    /* Filtrando los asientos según el tipo de clase, luego se crea
    dos array, una para la fila de los asientos, otra para las columna de los asientos */
    const firstClass = seats.filter((seat) => seat.seatTypeId === 1)
    const firstRow = []
    const firstColumn = []
    firstClass.forEach((seat) => {
      if (!firstRow.includes(seat.seatRow)) firstRow.push(seat.seatRow)
      if (!firstColumn.includes(seat.seatColumn)) firstColumn.push(seat.seatColumn)
    })

    const premiumClass = seats.filter((seat) => seat.seatTypeId === 2)
    const premiumRow = []
    const premiumColumn = []
    premiumClass.forEach((seat) => {
      if (!premiumRow.includes(seat.seatRow)) premiumRow.push(seat.seatRow)
      if (!premiumColumn.includes(seat.seatColumn)) premiumColumn.push(seat.seatColumn)
    })

    const economicClass = seats.filter((seat) => seat.seatTypeId === 3)
    const economicRow = []
    const economicColumn = []
    economicClass.forEach((seat) => {
      if (!economicRow.includes(seat.seatRow)) economicRow.push(seat.seatRow)
      if (!economicColumn.includes(seat.seatColumn)) economicColumn.push(seat.seatColumn)
    })

    const seatClass = [
      { row: firstRow, column: firstColumn },
      { row: premiumRow, column: premiumColumn },
      { row: economicRow, column: economicColumn }
    ]

    /* Se agrupa los pasajeros que según el purchaseId, luego se filtran en dos array,
    una para los pasajeros que van grupo con dos o mas personas y otra para los grupos
    que llevan al menos un menor de edad */
    const passengersGroup = passengers.reduce((newArray, data) => {
      const id = data.purchaseId
      if (!newArray[id]) {
        newArray[id] = []
      }
      newArray[id].push(data)
      return newArray
    }, {})
    const paxGroup = Object.values(passengersGroup).filter((passenger) => {
      let isChildPresent = false
      if (passenger.length < 2) return null
      passenger.forEach((passenger) => {
        if (passenger.age < 18) isChildPresent = true
      })
      return isChildPresent ? null : passenger
    })
    const paxGroupChild = Object.values(passengersGroup).filter((passenger) => {
      let isChildPresent = false
      passenger.forEach((pax) => {
        if (pax.age < 18) isChildPresent = true
      })
      return isChildPresent ? passenger : null
    })

    /**
      Recibe un array de pasajeros y asigna un asiento a cada pasajero del array.
      @param paxGroup - Un array de grupos de pasajeros que contenga un menor de edad.
    */
    const assignPaxGroupChild = (paxGroup) => {
      paxGroup.forEach((paxGroup) => {
        let isEven = false
        let groupSeat = []
        const groupLength = paxGroup.length
        if (groupLength % 2 === 0) isEven = true
        if (isEven) {
          for (let x = 0; x < economicRow.length; x++) {
            for (let y = 0; y < 2; y++) {
              if (groupSeat.length === paxGroup.length) break
              const seat = seats.find((seat) => seat.seatRow === economicRow[x] && seat.seatColumn === economicColumn[y])
              if (!seat) {
                groupSeat = []
              } else {
                groupSeat.push(seat.seatId)
              }
            }
          }
        } else {
          for (let x = 0; x < economicRow.length; x++) {
            for (let y = 0; y < economicColumn.length; y++) {
              if (groupSeat.length === paxGroup.length) break
              const seat = seats.find((seat) => seat.seatRow === economicRow[x] && seat.seatColumn === economicColumn[y])
              if (!seat) {
                groupSeat = []
              } else {
                groupSeat.push(seat.seatId)
              }
            }
          }
        }

        paxGroup.forEach((passenger) => {
          const passengerIndex = passengers.indexOf(passenger)
          if (passenger.seatTypeId === 3) {
            const seat = seats.find((seat) => seat.seatId === groupSeat[0])
            const seatIndex = seats.indexOf(seat)
            passengers[passengerIndex].seatId = groupSeat[0]
            groupSeat.shift()
            seats.splice(seatIndex, 1)
          }
        })
      })
    }

    /**
     Recibe un seatTypeId y un paxGroupLength y devuelve un array de seatId.
     @param seatTypeId - 0, 1, 2.
     @param paxGroupLength - La longitud del grupo de pasajeros.
     @returns Un array de seatId.
    */
    const autoAssignSeat = (seatTypeId, paxGroupLength) => {
      const seatGroup = []
      const isEmpty = seats.filter((seat) => seat.seatTypeId === seatTypeId + 1)
      if (seatTypeId === 1 && !isEmpty) {
        seatTypeId -= 1
      }
      for (let x = 0; x < seatClass[seatTypeId].row.length; x++) {
        for (let y = 0; y < seatClass[seatTypeId].column.length; y++) {
          if (seatGroup.length === paxGroupLength) break
          const seat = seats.find((seat) => {
            if (seat.seatRow === seatClass[seatTypeId].row[x] && seat.seatColumn === seatClass[seatTypeId].column[y]) {
              return seat
            }
            return null
          })
          if (seat) {
            seatGroup.push(seat.seatId)
          }
        }
      }
      return seatGroup
    }

    /**
     Recibe un array de pasajeros, se les asigna asientos según su seatTypeId y su grupo.
     @param paxGroup - Un array de grupos de pasajeros
     */
    const assignPaxGroup = (paxGroup) => {
      const unassignedPaxGroup = []
      paxGroup.forEach((paxGroup) => {
        let count = 0
        const seatGroup = []
        const lastSeats = []
        paxGroup.forEach((passenger) => {
          if (passenger.seatId) {
            count++
            seatGroup.push(passenger.seatId)
          }
        })

        if (paxGroup.length !== count) {
          if (seatGroup.length !== 0) {
            paxGroup.forEach((passenger) => {
              if (passenger.seatId) return
              seatGroup.sort()
              const passengerIndex = passengers.indexOf(passenger)
              let seat = seats.find((seat) => {
                if (seat.seatId === seatGroup[0] - 1 && seat.seatTypeId === passenger.seatTypeId) {
                  seatGroup.unshift(seat.seatId)
                  lastSeats.push(seat)
                  return seat
                } else if (seat.seatId === seatGroup.at(-1) + 1 && seat.seatTypeId === passenger.seatTypeId) {
                  seatGroup.push(seat.seatId)
                  lastSeats.push(seat)
                  return seat
                }
                return undefined
              })

              if (!seat) {
                if (lastSeats.length === 0) {
                  const newSeat = seatsBackup.find((seat) => seat.seatId === seatGroup[0])
                  lastSeats.push(newSeat)
                }
                const lastColumn = lastSeats[0].seatColumn
                for (let i = 1; i < 3; i++) {
                  const column = seatClass[passenger.seatTypeId - 1].column
                  const columnIndex = column.indexOf(lastColumn)
                  let columnSplice = []
                  if (columnIndex === column.length - 1) {
                    columnSplice = column.splice(columnIndex - 1, 1)
                  } else {
                    columnSplice = column.splice(columnIndex + 1, 1)
                  }

                  for (let i = 0; i < lastSeats.length; i++) {
                    seat = seats.find((seat) => {
                      if (seat.seatColumn === columnSplice[0] && seat.seatRow === lastSeats[i].seatRow) {
                        seatGroup.unshift(seat.seatId)
                        lastSeats.push(seat)
                        return seat
                      }
                      return undefined
                    })
                    if (seat) break
                  }
                }
                if (!seat) {
                  for (let i = 0; i < lastSeats.length; i++) {
                    seat = seats.find((seat) => {
                      if (seat.seatColumn === lastSeats[i].seatColumn && seat.seatTypeId === passenger.seatTypeId) {
                        return seat
                      }
                      return undefined
                    })
                    if (seat) break
                  }
                }
              }

              const seatIndex = seats.indexOf(seat)
              passengers[passengerIndex].seatId = seat.seatId
              seats.splice(seatIndex, 1)
            })
          } else {
            unassignedPaxGroup.push(paxGroup.filter((passenger) => !passenger.seatId))
          }
        }
      })
      unassignedPaxGroup.forEach((unassignedGroup) => {
        const seatGroup = autoAssignSeat(unassignedGroup[0].seatTypeId - 1, unassignedGroup.length)
        unassignedGroup.forEach((passenger) => {
          if (seatGroup.length === 0) return
          const passengerIndex = passengers.indexOf(passenger)
          const seat = seats.find((seat) => seat.seatId === seatGroup[0])
          passengers[passengerIndex].seatId = seatGroup[0]
          seatGroup.shift()
          const seatIndex = seats.indexOf(seat)
          seats.splice(seatIndex, 1)
        })
      })
    }

    // Asigna a los pasajeros que viajan solo según su seatTypeId.
    const assignLonePassenger = () => {
      passengers.forEach((passenger) => {
        if (passenger.seatId) return
        if (passenger.seatTypeId === 1) {
          const seat = seats.find((seat) => seat.seatTypeId === 1)
          const seatIndex = seats.indexOf(seat)
          passenger.seatId = seat.seatId
          seats.splice(seatIndex, 1)
        }
        if (passenger.seatTypeId === 2) {
          let seat = seats.find((seat) => seat.seatTypeId === 2)
          if (!seat) seat = seats.find((seat) => seat.seatTypeId === 1)
          const seatIndex = seats.indexOf(seat)
          passenger.seatId = seat.seatId
          seats.splice(seatIndex, 1)
        }
        if (passenger.seatTypeId === 3) {
          const seat = seats.filter((seat) => seat.seatTypeId === 3)
          const seatIndex = seats.indexOf(seat)
          passenger.seatId = seat.seatId
          seats.splice(seatIndex, 1)
        }
      })
    }

    assignPaxGroupChild(paxGroupChild)
    assignPaxGroup(paxGroup)
    assignLonePassenger()

    flight[0].passenger = passengers
    res.json({ code: 200, data: flight[0] })
  } catch {
    return res.json({ code: 400, errors: 'could not connect to db' })
  }
})

app.listen(PORT)
